
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type {
  ComputeOffer,
  ComputeProvider,
} from '../src/providers/ComputeProvider.js';
import { syncComputeOffers } from '../src/services/compute-sync.js';

const offer: ComputeOffer = {
  id: 'offer-123',
  provider: 'vast',
  gpuName: 'NVIDIA RTX 4090',
  gpuCount: 1,
  hourlyPriceUsd: 0.42,
  gpuMemoryMb: 24576,
  reliability: 0.98,
};

function createDependencies(existingAsset = false) {
  const tx = {
    provider: {
      upsert: vi.fn().mockResolvedValue({
        id: 'provider-1',
        key: 'vast',
        name: 'vast',
      }),
    },
    computeAsset: {
      findUnique: vi.fn().mockResolvedValue(
        existingAsset ? { id: 'asset-1' } : null,
      ),
      upsert: vi.fn().mockResolvedValue({ id: 'asset-1' }),
    },
    computeResource: {
      upsert: vi.fn().mockResolvedValue({ id: 'resource-1' }),
    },
    gpuDevice: {
      upsert: vi.fn().mockResolvedValue({ id: 'gpu-1' }),
    },
  };

  const transaction = vi.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );

  const db = {
    ...tx,
    $transaction: transaction,
  } as unknown as PrismaClient;

  const provider: ComputeProvider = {
    name: 'vast',
    searchOffers: vi.fn().mockResolvedValue([offer]),
    healthCheck: vi.fn().mockResolvedValue(true),
  };

  return { tx, db, provider, transaction };
}

describe('syncComputeOffers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a newly discovered offer and its resource records', async () => {
    const { tx, db, provider, transaction } = createDependencies();

    const result = await syncComputeOffers(db, provider, { limit: 3 });

    expect(result).toEqual({
      provider: 'vast',
      received: 1,
      created: 1,
      updated: 0,
      skipped: 0,
    });

    expect(provider.searchOffers).toHaveBeenCalledWith({ limit: 3 });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.provider.upsert).toHaveBeenCalledOnce();
    expect(tx.computeAsset.upsert).toHaveBeenCalledOnce();
    expect(tx.computeResource.upsert).toHaveBeenCalledOnce();
    expect(tx.gpuDevice.upsert).toHaveBeenCalledOnce();

    expect(tx.computeAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'AVAILABLE',
          lastSeenAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          status: 'AVAILABLE',
          deletedAt: null,
          lastSeenAt: expect.any(Date),
        }),
      }),
    );

    expect(tx.computeResource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          computeAssetId_resourceType: {
            computeAssetId: 'asset-1',
            resourceType: 'provider_offer',
          },
        },
      }),
    );

    expect(tx.gpuDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          computeAssetId_model: {
            computeAssetId: 'asset-1',
            model: 'NVIDIA RTX 4090',
          },
        },
      }),
    );
  });

  it('updates an existing offer instead of counting it as new', async () => {
    const { tx, db, provider } = createDependencies(true);

    const result = await syncComputeOffers(db, provider);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(tx.computeAsset.findUnique).toHaveBeenCalledOnce();
    expect(tx.computeAsset.upsert).toHaveBeenCalledOnce();
    expect(tx.computeResource.upsert).toHaveBeenCalledOnce();
    expect(tx.gpuDevice.upsert).toHaveBeenCalledOnce();
  });

  it('restores an existing offer and refreshes its last-seen timestamp', async () => {
    const { tx, db, provider } = createDependencies(true);

    await syncComputeOffers(db, provider);

    expect(tx.computeAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'AVAILABLE',
          deletedAt: null,
          lastSeenAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does not start a database transaction when provider discovery fails', async () => {
    const { tx, db, provider, transaction } = createDependencies();

    vi.mocked(provider.searchOffers).mockRejectedValueOnce(
      new Error('Provider unavailable'),
    );

    await expect(syncComputeOffers(db, provider)).rejects.toThrow(
      'Provider unavailable',
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(tx.provider.upsert).not.toHaveBeenCalled();
    expect(tx.computeAsset.upsert).not.toHaveBeenCalled();
  });

  it('uses upserts to update existing resource records without separate creates', async () => {
    const { tx, db, provider } = createDependencies(true);

    await syncComputeOffers(db, provider);

    expect(tx.computeResource.upsert).toHaveBeenCalledOnce();
    expect(tx.gpuDevice.upsert).toHaveBeenCalledOnce();

    expect(tx.computeResource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          quantity: 1,
          unit: 'offer',
        }),
      }),
    );

    expect(tx.gpuDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          memoryGb: 24,
          count: 1,
        },
      }),
    );
  });

  it('skips offers with blank IDs', async () => {
    const { tx, db, provider } = createDependencies();

    vi.mocked(provider.searchOffers).mockResolvedValueOnce([
      { ...offer, id: '   ' },
    ]);

    const result = await syncComputeOffers(db, provider);

    expect(result).toEqual({
      provider: 'vast',
      received: 1,
      created: 0,
      updated: 0,
      skipped: 1,
    });

    expect(tx.provider.upsert).toHaveBeenCalledOnce();
    expect(tx.computeAsset.upsert).not.toHaveBeenCalled();
    expect(tx.computeResource.upsert).not.toHaveBeenCalled();
    expect(tx.gpuDevice.upsert).not.toHaveBeenCalled();
  });

  it('propagates transaction failures', async () => {
    const { db, provider, transaction } = createDependencies();

    transaction.mockRejectedValueOnce(new Error('Database write failed'));

    await expect(syncComputeOffers(db, provider)).rejects.toThrow(
      'Database write failed',
    );

    expect(transaction).toHaveBeenCalledOnce();
  });
});
