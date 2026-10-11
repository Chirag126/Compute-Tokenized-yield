
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { ComputeOffer, ComputeProvider } from '../src/providers/ComputeProvider.js';
import { syncComputeOffers } from '../src/services/compute-sync.js';

// Load the repository's .env when running this test directly.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const integrationEnabled = process.env.RUN_DB_INTEGRATION === '1';
const integrationDescribe = integrationEnabled ? describe : describe.skip;

integrationDescribe('Compute sync PostgreSQL integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration test');
    }

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it(
    'rolls back the asset and resource when a later GPU write fails',
    async () => {
      const offerId = `rollback-${randomUUID()}`;

      // 170 characters exceeds GpuDevice.model's VarChar(160)
      // but the generated asset name remains within VarChar(200).
      const offer: ComputeOffer = {
        id: offerId,
        provider: 'vast',
        gpuName: 'X'.repeat(170),
        gpuCount: 1,
        hourlyPriceUsd: 0.42,
        gpuMemoryMb: 24576,
        reliability: 0.98,
      };

      const provider: ComputeProvider = {
        name: 'vast',
        searchOffers: async () => [offer],
        healthCheck: async () => true,
      };

      // Asset and provider-offer resource writes should happen before
      // the oversized GPU model causes PostgreSQL to reject the write.
      await expect(
        syncComputeOffers(prisma, provider, { limit: 1 }),
      ).rejects.toThrow();

      const leakedAsset = await prisma.computeAsset.findFirst({
        where: { externalAssetId: offerId },
        select: { id: true },
      });

      // If this assertion fails, clean up this uniquely identified test
      // asset before reporting the failure.
      if (leakedAsset) {
        await prisma.computeAsset.delete({
          where: { id: leakedAsset.id },
        });
      }

      expect(leakedAsset).toBeNull();
    },
    20_000,
  );

  
  it(
    'prevents duplicate assets, resources, and GPUs during concurrent syncs',
    async () => {
      const offerId = `concurrent-${randomUUID()}`;

      const offer: ComputeOffer = {
        id: offerId,
        provider: 'vast',
        gpuName: 'Integration Test GPU',
        gpuCount: 1,
        hourlyPriceUsd: 0.42,
        gpuMemoryMb: 24576,
        reliability: 0.98,
      };

      const provider: ComputeProvider = {
        name: 'vast',
        searchOffers: async () => [offer],
        healthCheck: async () => true,
      };

      try {
        // Both calls discover the same offer and write concurrently.
        await Promise.all([
          syncComputeOffers(prisma, provider, { limit: 1 }),
          syncComputeOffers(prisma, provider, { limit: 1 }),
        ]);

        const asset = await prisma.computeAsset.findUnique({
          where: {
            providerId_externalAssetId: {
              providerId: (
                await prisma.provider.findUniqueOrThrow({
                  where: { key: 'vast' },
                  select: { id: true },
                })
              ).id,
              externalAssetId: offerId,
            },
          },
          include: {
            resources: {
              where: { resourceType: 'provider_offer' },
            },
            gpuDevices: {
              where: { model: 'Integration Test GPU' },
            },
          },
        });

        expect(asset).not.toBeNull();
        expect(asset?.resources).toHaveLength(1);
        expect(asset?.gpuDevices).toHaveLength(1);
      } finally {
        // The random test ID ensures this cleanup cannot target real offers.
        await prisma.computeAsset.deleteMany({
          where: { externalAssetId: offerId },
        });
      }
    },
    20_000,
  );

});
