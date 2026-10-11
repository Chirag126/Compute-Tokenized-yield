
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reconcileRevenueRecord,
  RevenueReconciliationInputError,
  RevenueReconciliationNotFoundError,
} from '../src/services/revenue-reconciliation.js';

const revenue = {
  id: 'revenue-1',
  computeAssetId: 'asset-1',
  billingRecordId: 'billing-1',
  source: 'provider_billing',
  sourceReference: 'invoice-123',
  amount: new Prisma.Decimal('12.50'),
  currency: 'USD',
  periodStart: new Date('2026-10-01T00:00:00.000Z'),
  periodEnd: new Date('2026-10-02T00:00:00.000Z'),
  status: 'PENDING' as const,
  verifiedAt: null,
  createdAt: new Date('2026-10-02T00:00:00.000Z'),
  updatedAt: new Date('2026-10-02T00:00:00.000Z'),
  billingRecord: {
    id: 'billing-1',
    providerId: 'provider-1',
    instanceId: null,
    externalInvoiceId: 'invoice-123',
    amount: new Prisma.Decimal('12.50'),
    currency: 'USD',
    periodStart: new Date('2026-10-01T00:00:00.000Z'),
    periodEnd: new Date('2026-10-02T00:00:00.000Z'),
    rawPayload: null,
    billedAt: null,
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
  },
};

function createDependencies() {
  const tx = {
    revenueRecord: {
      findUnique: vi.fn().mockResolvedValue(revenue),
    },
    revenueReconciliation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'reconciliation-1',
        ...data,
        createdAt: new Date(),
      })),
    },
  };

  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  } as unknown as PrismaClient;

  return { prisma, tx };
}

describe('reconcileRevenueRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an identical latest reconciliation on retry', async () => {
    const { prisma, tx } = createDependencies();

    const existing = {
      id: 'reconciliation-existing',
      revenueRecordId: 'revenue-1',
      status: 'MATCHED',
      expectedAmount: new Prisma.Decimal('12.50'),
      actualAmount: new Prisma.Decimal('12.50'),
      variance: new Prisma.Decimal('0'),
      details: {
        billingRecordId: 'billing-1',
        externalInvoiceId: 'invoice-123',
        currency: 'USD',
        comparison: 'actual_minus_expected',
      },
    reconciledAt: new Date('2026-10-02T00:00:00.000Z'),
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
  };

  tx.revenueReconciliation.findFirst.mockResolvedValueOnce(existing);

  const result = await reconcileRevenueRecord(prisma, {
    revenueRecordId: 'revenue-1',
  });

  expect(result.reused).toBe(true);
  expect(result.reconciliation).toEqual(existing);
  expect(tx.revenueReconciliation.create).not.toHaveBeenCalled();
});

  it('creates a new audit entry when the billing reference changes', async () => {
    const { prisma, tx } = createDependencies();

  tx.revenueReconciliation.findFirst.mockResolvedValueOnce({
    id: 'reconciliation-existing',
    revenueRecordId: 'revenue-1',
    status: 'MATCHED',
    expectedAmount: new Prisma.Decimal('12.50'),
    actualAmount: new Prisma.Decimal('12.50'),
    variance: new Prisma.Decimal('0'),
    details: {
      billingRecordId: 'old-billing-record',
      externalInvoiceId: 'old-invoice',
      currency: 'USD',
      comparison: 'actual_minus_expected',
    },
    reconciledAt: new Date('2026-10-02T00:00:00.000Z'),
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
  });

  const result = await reconcileRevenueRecord(prisma, {
    revenueRecordId: 'revenue-1',
  });

  expect(result.reused).toBe(false);
  expect(tx.revenueReconciliation.create).toHaveBeenCalledTimes(1);
  expect(tx.revenueReconciliation.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      revenueRecordId: 'revenue-1',
      status: 'MATCHED',
    }),
  });
});

  it('records MATCHED when billing and expected amounts are equal', async () => {
    const { prisma, tx } = createDependencies();

    const result = await reconcileRevenueRecord(prisma, {
      revenueRecordId: 'revenue-1',
    });

    expect(result.matched).toBe(true);
    expect(result.revenueStatus).toBe('PENDING');

    expect(tx.revenueReconciliation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revenueRecordId: 'revenue-1',
        status: 'MATCHED',
        expectedAmount: new Prisma.Decimal('12.50'),
        actualAmount: new Prisma.Decimal('12.50'),
        variance: new Prisma.Decimal('0'),
      }),
    });
  });

  it('records MISMATCHED when billing and expected amounts differ', async () => {
    const { prisma, tx } = createDependencies();

    tx.revenueRecord.findUnique.mockResolvedValueOnce({
      ...revenue,
      billingRecord: {
        ...revenue.billingRecord,
        amount: new Prisma.Decimal('15.00'),
      },
    });

    const result = await reconcileRevenueRecord(prisma, {
      revenueRecordId: 'revenue-1',
    });

    expect(result.matched).toBe(false);

    expect(tx.revenueReconciliation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'MISMATCHED',
        variance: new Prisma.Decimal('2.50'),
      }),
    });
  });

  it('rejects an unknown revenue record', async () => {
    const { prisma, tx } = createDependencies();

    tx.revenueRecord.findUnique.mockResolvedValueOnce(null);

    await expect(
      reconcileRevenueRecord(prisma, {
        revenueRecordId: 'missing',
      }),
    ).rejects.toBeInstanceOf(RevenueReconciliationNotFoundError);

    expect(tx.revenueReconciliation.create).not.toHaveBeenCalled();
  });

  it('rejects a revenue record without linked billing', async () => {
    const { prisma, tx } = createDependencies();

    tx.revenueRecord.findUnique.mockResolvedValueOnce({
      ...revenue,
      billingRecord: null,
    });

    await expect(
      reconcileRevenueRecord(prisma, {
        revenueRecordId: 'revenue-1',
      }),
    ).rejects.toBeInstanceOf(RevenueReconciliationInputError);

    expect(tx.revenueReconciliation.create).not.toHaveBeenCalled();
  });

  it('rejects currency mismatches', async () => {
    const { prisma, tx } = createDependencies();

    tx.revenueRecord.findUnique.mockResolvedValueOnce({
      ...revenue,
      billingRecord: {
        ...revenue.billingRecord,
        currency: 'EUR',
      },
    });

    await expect(
      reconcileRevenueRecord(prisma, {
        revenueRecordId: 'revenue-1',
      }),
    ).rejects.toThrow('currencies do not match');

    expect(tx.revenueReconciliation.create).not.toHaveBeenCalled();
  });

  it('rejects billing-period mismatches', async () => {
    const { prisma, tx } = createDependencies();

    tx.revenueRecord.findUnique.mockResolvedValueOnce({
      ...revenue,
      billingRecord: {
        ...revenue.billingRecord,
        periodEnd: new Date('2026-10-03T00:00:00.000Z'),
      },
    });

    await expect(
      reconcileRevenueRecord(prisma, {
        revenueRecordId: 'revenue-1',
      }),
    ).rejects.toThrow('periods do not match');

    expect(tx.revenueReconciliation.create).not.toHaveBeenCalled();
  });

  it('rejects an empty revenue record ID', async () => {
    const { prisma, tx } = createDependencies();

    await expect(
      reconcileRevenueRecord(prisma, {
        revenueRecordId: '   ',
      }),
    ).rejects.toBeInstanceOf(RevenueReconciliationInputError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates unexpected database errors', async () => {
    const { prisma, tx } = createDependencies();

    tx.revenueReconciliation.create.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );

    await expect(
      reconcileRevenueRecord(prisma, {
        revenueRecordId: 'revenue-1',
      }),
    ).rejects.toThrow('Database unavailable');
  });
});
