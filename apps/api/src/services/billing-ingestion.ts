
import { Prisma, PrismaClient } from '@prisma/client';

export interface BillingInput {
  providerKey: string;
  externalInvoiceId: string;
  providerInstanceId?: string;
  amount: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  billedAt?: Date;
}

export class BillingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingConflictError';
  }
}

export class BillingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingNotFoundError';
  }
}

function sameBilling(
  existing: {
    externalInvoiceId: string | null;
    instanceId: string | null;
    amount: Prisma.Decimal;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
    billedAt: Date | null;
  },
  input: BillingInput,
  instanceId: string | null,
): boolean {
  return (
    existing.externalInvoiceId === input.externalInvoiceId &&
    existing.instanceId === instanceId &&
    existing.amount.equals(input.amount) &&
    existing.currency === input.currency &&
    existing.periodStart.getTime() === input.periodStart.getTime() &&
    existing.periodEnd.getTime() === input.periodEnd.getTime() &&
    (existing.billedAt?.getTime() ?? null) ===
      (input.billedAt?.getTime() ?? null)
  );
}

function validateBillingInput(input: BillingInput): void {
  if (!input.providerKey.trim()) {
    throw new Error('Provider key is required');
  }

  if (!input.externalInvoiceId.trim()) {
    throw new Error('External invoice ID is required');
  }

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(input.amount);
  } catch {
    throw new Error('Billing amount must be a valid decimal');
  }

  if (!amount.isFinite() || amount.isNegative()) {
    throw new Error('Billing amount must be finite and non-negative');
  }

  if (
    !(input.periodStart instanceof Date) ||
    !Number.isFinite(input.periodStart.getTime()) ||
    !(input.periodEnd instanceof Date) ||
    !Number.isFinite(input.periodEnd.getTime()) ||
    input.periodEnd.getTime() <= input.periodStart.getTime()
  ) {
    throw new Error('Billing period must contain valid dates and end after it starts');
  }

  if (
    input.billedAt !== undefined &&
    (!(input.billedAt instanceof Date) ||
      !Number.isFinite(input.billedAt.getTime()))
  ) {
    throw new Error('Billed-at date must be valid');
  }

  if (!input.currency.trim()) {
    throw new Error('Currency is required');
  }
}
export async function ingestProviderBilling(
  prisma: PrismaClient,
  input: BillingInput,
) {
  validateBillingInput(input);
  const provider = await prisma.provider.findUnique({
    where: { key: input.providerKey },
    select: { id: true },
  });

  if (!provider) {
    throw new BillingNotFoundError('Provider does not exist');
  }

  let instanceId: string | null = null;

  if (input.providerInstanceId) {
    const instance = await prisma.computeInstance.findUnique({
      where: {
        providerId_providerInstanceId: {
          providerId: provider.id,
          providerInstanceId: input.providerInstanceId,
        },
      },
      select: { id: true },
    });

    if (!instance) {
      throw new BillingNotFoundError(
        'Compute instance does not exist for this provider',
      );
    }

    instanceId = instance.id;
  }

  const existing = await prisma.providerBilling.findUnique({
    where: {
      providerId_externalInvoiceId: {
        providerId: provider.id,
        externalInvoiceId: input.externalInvoiceId,
      },
    },
  });

  if (existing) {
    if (!sameBilling(existing, input, instanceId)) {
      throw new BillingConflictError(
        'Invoice ID already exists with different billing data',
      );
    }

    return { created: false, billing: existing };
  }

  try {
    const billing = await prisma.providerBilling.create({
      data: {
        providerId: provider.id,
        instanceId,
        externalInvoiceId: input.externalInvoiceId,
        amount: input.amount,
        currency: input.currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        billedAt: input.billedAt,
      },
    });

    return { created: true, billing };
  } catch (error) {
    // A concurrent request may have inserted the same invoice after
    // our initial lookup. Re-read it and apply the same idempotency rule.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const raced = await prisma.providerBilling.findUnique({
        where: {
          providerId_externalInvoiceId: {
            providerId: provider.id,
            externalInvoiceId: input.externalInvoiceId,
          },
        },
      });

      if (raced && sameBilling(raced, input, instanceId)) {
        return { created: false, billing: raced };
      }

      if (raced) {
        throw new BillingConflictError(
          'Invoice ID already exists with different billing data',
        );
      }
    }

    throw error;
  }
}
