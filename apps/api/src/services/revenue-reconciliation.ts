
import { Prisma, PrismaClient } from '@prisma/client';

export class RevenueReconciliationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueReconciliationNotFoundError';
  }
}

export class RevenueReconciliationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueReconciliationInputError';
  }
}

export interface ReconcileRevenueInput {
  revenueRecordId: string;
}

type ReconciliationSnapshot = {
  id: string;
  status: string;
  expectedAmount: Prisma.Decimal;
  actualAmount: Prisma.Decimal | null;
  variance: Prisma.Decimal | null;
  details: Prisma.JsonValue;
};

function detailsMatch(
  details: Prisma.JsonValue,
  billingRecordId: string,
  externalInvoiceId: string | null,
  currency: string,
): boolean {
  if (
    details === null ||
    typeof details !== 'object' ||
    Array.isArray(details)
  ) {
    return false;
  }

  const snapshot = details as Prisma.JsonObject;

  return (
    snapshot.billingRecordId === billingRecordId &&
    snapshot.externalInvoiceId === externalInvoiceId &&
    snapshot.currency === currency &&
    snapshot.comparison === 'actual_minus_expected'
  );
}

function isSameReconciliation(
  existing: ReconciliationSnapshot,
  expectedAmount: Prisma.Decimal,
  actualAmount: Prisma.Decimal,
  variance: Prisma.Decimal,
  status: 'MATCHED' | 'MISMATCHED',
  billingRecordId: string,
  externalInvoiceId: string | null,
  currency: string,
): boolean {
  return (
    existing.status === status &&
    existing.expectedAmount.equals(expectedAmount) &&
    existing.actualAmount !== null &&
    existing.actualAmount.equals(actualAmount) &&
    existing.variance !== null &&
    existing.variance.equals(variance) &&
    detailsMatch(
      existing.details,
      billingRecordId,
      externalInvoiceId,
      currency,
    )
  );
}

export async function reconcileRevenueRecord(
  prisma: PrismaClient,
  input: ReconcileRevenueInput,
) {
  if (!input.revenueRecordId.trim()) {
    throw new RevenueReconciliationInputError(
      'Revenue record ID is required',
    );
  }

  return prisma.$transaction(async (tx) => {
    const revenue = await tx.revenueRecord.findUnique({
      where: { id: input.revenueRecordId },
      include: {
        billingRecord: true,
      },
    });

    if (!revenue) {
      throw new RevenueReconciliationNotFoundError(
        'Revenue record does not exist',
      );
    }

    if (!revenue.billingRecord) {
      throw new RevenueReconciliationInputError(
        'Revenue record has no linked provider billing record',
      );
    }

    const billing = revenue.billingRecord;

    if (revenue.currency !== billing.currency) {
      throw new RevenueReconciliationInputError(
        'Revenue and provider billing currencies do not match',
      );
    }

    if (
      revenue.periodStart.getTime() !== billing.periodStart.getTime() ||
      revenue.periodEnd.getTime() !== billing.periodEnd.getTime()
    ) {
      throw new RevenueReconciliationInputError(
        'Revenue and provider billing periods do not match',
      );
    }

    const expectedAmount = new Prisma.Decimal(revenue.amount);
    const actualAmount = new Prisma.Decimal(billing.amount);
    const variance = actualAmount.minus(expectedAmount);
    const status = variance.isZero() ? 'MATCHED' : 'MISMATCHED';

    // Reuse an identical latest result so ordinary retries do not
    // create duplicate audit rows.
    const latest = await tx.revenueReconciliation.findFirst({
      where: {
        revenueRecordId: revenue.id,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });

    if (
      latest &&
      isSameReconciliation(
        latest,
        expectedAmount,
        actualAmount,
        variance,
        status,
        billing.id,
        billing.externalInvoiceId,
        revenue.currency,
      )
    ) {
      return {
        reconciliation: latest,
        revenueStatus: revenue.status,
        matched: status === 'MATCHED',
        reused: true,
      };
    }

    const reconciledAt = new Date();

    const reconciliation = await tx.revenueReconciliation.create({
      data: {
        revenueRecordId: revenue.id,
        status,
        expectedAmount,
        actualAmount,
        variance,
        reconciledAt,
        details: {
          billingRecordId: billing.id,
          externalInvoiceId: billing.externalInvoiceId,
          currency: revenue.currency,
          comparison: 'actual_minus_expected',
        },
      },
    });

    return {
      reconciliation,
      revenueStatus: revenue.status,
      matched: status === 'MATCHED',
      reused: false,
    };
  });
}
