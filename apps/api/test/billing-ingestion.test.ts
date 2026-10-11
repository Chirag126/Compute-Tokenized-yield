
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  BillingConflictError,
  BillingNotFoundError,
  ingestProviderBilling,
  type BillingInput,
} from '../src/services/billing-ingestion.js';

const provider = { id: 'provider-1' };
const instance = { id: 'instance-1' };

const billingInput: BillingInput = {
  providerKey: 'vast',
  externalInvoiceId: 'invoice-123',
  providerInstanceId: 'instance-123',
  amount: '12.50',
  currency: 'USD',
  periodStart: new Date('2026-10-01T00:00:00.000Z'),
  periodEnd: new Date('2026-10-02T00:00:00.000Z'),
  billedAt: new Date('2026-10-02T01:00:00.000Z'),
};

function makeBilling(overrides: Record<string, unknown> = {}) {
  return {
    id: 'billing-1',
    providerId: provider.id,
    instanceId: instance.id,
    externalInvoiceId: billingInput.externalInvoiceId,
    amount: new Prisma.Decimal(billingInput.amount),
    currency: billingInput.currency,
    periodStart: billingInput.periodStart,
    periodEnd: billingInput.periodEnd,
    billedAt: billingInput.billedAt,
    rawPayload: null,
    createdAt: new Date('2026-10-02T02:00:00.000Z'),
    ...overrides,
  };
}

function createDependencies() {
  const prisma = {
    provider: {
      findUnique: vi.fn().mockResolvedValue(provider),
    },
    computeInstance: {
      findUnique: vi.fn().mockResolvedValue(instance),
    },
    providerBilling: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeBilling()),
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    mocks: prisma,
  };
}

describe('ingestProviderBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new billing record', async () => {
    const { prisma, mocks } = createDependencies();
    const billing = makeBilling();

    mocks.providerBilling.create.mockResolvedValueOnce(billing);

    const result = await ingestProviderBilling(prisma, billingInput);

    expect(result).toEqual({
      created: true,
      billing,
    });

    expect(mocks.provider.findUnique).toHaveBeenCalledWith({
      where: { key: 'vast' },
      select: { id: true },
    });

    expect(mocks.computeInstance.findUnique).toHaveBeenCalledWith({
      where: {
        providerId_providerInstanceId: {
          providerId: 'provider-1',
          providerInstanceId: 'instance-123',
        },
      },
      select: { id: true },
    });

    expect(mocks.providerBilling.create).toHaveBeenCalledWith({
      data: {
        providerId: 'provider-1',
        instanceId: 'instance-1',
        externalInvoiceId: 'invoice-123',
        amount: '12.50',
        currency: 'USD',
        periodStart: billingInput.periodStart,
        periodEnd: billingInput.periodEnd,
        billedAt: billingInput.billedAt,
      },
    });
  });

  it('returns an existing record for an identical duplicate invoice', async () => {
    const { prisma, mocks } = createDependencies();
    const existing = makeBilling();

    mocks.providerBilling.findUnique.mockResolvedValueOnce(existing);

    const result = await ingestProviderBilling(prisma, billingInput);

    expect(result).toEqual({
      created: false,
      billing: existing,
    });

    expect(mocks.providerBilling.create).not.toHaveBeenCalled();
  });

  it('rejects an invoice ID reused with different billing data', async () => {
    const { prisma, mocks } = createDependencies();

    mocks.providerBilling.findUnique.mockResolvedValueOnce(
      makeBilling({
        amount: new Prisma.Decimal('99.00'),
      }),
    );

    await expect(
      ingestProviderBilling(prisma, billingInput),
    ).rejects.toBeInstanceOf(BillingConflictError);

    expect(mocks.providerBilling.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider', async () => {
    const { prisma, mocks } = createDependencies();

    mocks.provider.findUnique.mockResolvedValueOnce(null);

    await expect(
      ingestProviderBilling(prisma, billingInput),
    ).rejects.toBeInstanceOf(BillingNotFoundError);

    expect(mocks.computeInstance.findUnique).not.toHaveBeenCalled();
    expect(mocks.providerBilling.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown compute instance', async () => {
    const { prisma, mocks } = createDependencies();

    mocks.computeInstance.findUnique.mockResolvedValueOnce(null);

    await expect(
      ingestProviderBilling(prisma, billingInput),
    ).rejects.toBeInstanceOf(BillingNotFoundError);

    expect(mocks.providerBilling.create).not.toHaveBeenCalled();
  });

  it('allows billing without a compute instance', async () => {
    const { prisma, mocks } = createDependencies();
    const input: BillingInput = {
      ...billingInput,
      providerInstanceId: undefined,
    };

    const result = await ingestProviderBilling(prisma, input);

    expect(result.created).toBe(true);
    expect(mocks.computeInstance.findUnique).not.toHaveBeenCalled();

    expect(mocks.providerBilling.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 'provider-1',
        instanceId: null,
        externalInvoiceId: 'invoice-123',
      }),
    });
  });

  it('returns an identical record when a concurrent insert wins', async () => {
    const { prisma, mocks } = createDependencies();
    const existing = makeBilling();

    mocks.providerBilling.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '6.19.0',
        },
      ),
    );

    mocks.providerBilling.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    const result = await ingestProviderBilling(prisma, billingInput);

    expect(result).toEqual({
      created: false,
      billing: existing,
    });

    expect(mocks.providerBilling.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects a conflicting record when a concurrent insert wins', async () => {
    const { prisma, mocks } = createDependencies();

    mocks.providerBilling.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '6.19.0',
        },
      ),
    );

    mocks.providerBilling.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        makeBilling({
          amount: new Prisma.Decimal('99.00'),
        }),
      );

    await expect(
      ingestProviderBilling(prisma, billingInput),
    ).rejects.toBeInstanceOf(BillingConflictError);
  });

  it('propagates unexpected database errors', async () => {
    const { prisma, mocks } = createDependencies();

    mocks.providerBilling.create.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );

    await expect(
      ingestProviderBilling(prisma, billingInput),
    ).rejects.toThrow('Database unavailable');
  });
});

  it('rejects a negative billing amount before database access', async () => {
    const { prisma, mocks } = createDependencies();

    await expect(
      ingestProviderBilling(prisma, {
        ...billingInput,
        amount: '-1.00',
      }),
    ).rejects.toThrow();

    expect(mocks.provider.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric billing amount before database access', async () => {
    const { prisma, mocks } = createDependencies();

    await expect(
      ingestProviderBilling(prisma, {
        ...billingInput,
        amount: 'not-a-number',
      }),
    ).rejects.toThrow();

    expect(mocks.provider.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an invalid billing period before database access', async () => {
    const { prisma, mocks } = createDependencies();

    await expect(
      ingestProviderBilling(prisma, {
        ...billingInput,
        periodStart: new Date('2026-10-03T00:00:00.000Z'),
        periodEnd: new Date('2026-10-02T00:00:00.000Z'),
      }),
    ).rejects.toThrow();

    expect(mocks.provider.findUnique).not.toHaveBeenCalled();
  });

  it('rejects invalid billing dates before database access', async () => {
    const { prisma, mocks } = createDependencies();

    await expect(
      ingestProviderBilling(prisma, {
        ...billingInput,
        billedAt: new Date('invalid'),
      }),
    ).rejects.toThrow();

    expect(mocks.provider.findUnique).not.toHaveBeenCalled();
  });
