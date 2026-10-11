
import type { PrismaClient } from '@prisma/client';
import type {
  ComputeOffer,
  ComputeProvider,
} from '../providers/ComputeProvider.js';

export interface ComputeSyncResult {
  provider: string;
  received: number;
  created: number;
  updated: number;
  skipped: number;
}

function offerDetails(offer: ComputeOffer) {
  return {
    provider: offer.provider,
    hourlyPriceUsd: offer.hourlyPriceUsd,
    reliability: offer.reliability,
    gpuMemoryMb: offer.gpuMemoryMb,
    gpuCount: offer.gpuCount,
  };
}

export async function syncComputeOffers(
  prisma: PrismaClient,
  provider: ComputeProvider,
  options: { limit?: number } = {},
): Promise<ComputeSyncResult> {
  // Discover offers before writing anything to the database.
  const offers = await provider.searchOffers({
    limit: options.limit ?? 10,
  });

  return prisma.$transaction(async (tx) => {
    const providerRecord = await tx.provider.upsert({
      where: { key: provider.name },
      create: {
        key: provider.name,
        name: provider.name,
        status: 'ACTIVE',
      },
      update: {
        name: provider.name,
      },
    });

    const result: ComputeSyncResult = {
      provider: provider.name,
      received: offers.length,
      created: 0,
      updated: 0,
      skipped: 0,
    };

    for (const offer of offers) {
      if (!offer.id.trim()) {
        result.skipped += 1;
        continue;
      }

      const assetKey = {
        providerId_externalAssetId: {
          providerId: providerRecord.id,
          externalAssetId: offer.id,
        },
      };

      // Used for created/updated reporting.
      const existing = await tx.computeAsset.findUnique({
        where: assetKey,
        select: { id: true },
      });

      const name = offer.gpuName
        ? `${offer.gpuName} GPU offer`
        : `Vast.ai offer ${offer.id}`;

      const asset = await tx.computeAsset.upsert({
        where: assetKey,
        create: {
          providerId: providerRecord.id,
          externalAssetId: offer.id,
          name,
          description:
            'Discovered provider offer; not proof of ownership or a reserved instance.',
          status: 'AVAILABLE',
          lastSeenAt: new Date(),
        },
        update: {
          name,
          status: 'AVAILABLE',
          deletedAt: null,
          lastSeenAt: new Date(),
        },
      });

      await tx.computeResource.upsert({
        where: {
          computeAssetId_resourceType: {
            computeAssetId: asset.id,
            resourceType: 'provider_offer',
          },
        },
        create: {
          computeAssetId: asset.id,
          resourceType: 'provider_offer',
          quantity: 1,
          unit: 'offer',
          details: offerDetails(offer),
        },
        update: {
          quantity: 1,
          unit: 'offer',
          details: offerDetails(offer),
        },
      });

      if (offer.gpuName) {
        const gpuData = {
          memoryGb:
            offer.gpuMemoryMb === null
              ? null
              : Math.round(offer.gpuMemoryMb / 1024),
          count: offer.gpuCount ?? 1,
        };

        await tx.gpuDevice.upsert({
          where: {
            computeAssetId_model: {
              computeAssetId: asset.id,
              model: offer.gpuName,
            },
          },
          create: {
            computeAssetId: asset.id,
            model: offer.gpuName,
            ...gpuData,
          },
          update: gpuData,
        });
      }

      if (existing) {
        result.updated += 1;
      } else {
        result.created += 1;
      }
    }

    return result;
  });
}
