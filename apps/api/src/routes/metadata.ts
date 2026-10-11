
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Public, read-only metadata for a provider offer synchronized into PostgreSQL.
 *
 * The URL ID is the database ComputeAsset UUID, not the on-chain registry ID.
 * Staleness is derived from the last successful observation and is not persisted.
 */
export default async function metadataRoutes(app: FastifyInstance) {
  app.get('/metadata/compute-assets/:id', async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ASSET_ID',
          message: 'Asset ID must be a UUID',
        },
      });
    }

    const asset = await app.prisma.computeAsset.findFirst({
      where: {
        id: parsed.data.id,
        deletedAt: null,
      },
      select: {
        id: true,
        externalAssetId: true,
        name: true,
        description: true,
        region: true,
        status: true,
        updatedAt: true,
        lastSeenAt: true,
        provider: {
          select: {
            key: true,
            name: true,
            status: true,
          },
        },
        gpuDevices: {
          select: {
            model: true,
            memoryGb: true,
            count: true,
          },
          orderBy: { model: 'asc' },
        },
        resources: {
          where: { resourceType: 'provider_offer' },
          select: {
            resourceType: true,
            quantity: true,
            unit: true,
            details: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!asset) {
      return reply.code(404).send({
        error: {
          code: 'ASSET_NOT_FOUND',
          message: 'No synchronized compute asset was found for this ID',
        },
      });
    }

    const offerResource = asset.resources[0];

    const details =
      offerResource?.details &&
      typeof offerResource.details === 'object' &&
      !Array.isArray(offerResource.details)
        ? (offerResource.details as Record<string, unknown>)
        : {};

    const ageMs = Math.max(
      0,
      Date.now() - asset.lastSeenAt.getTime(),
    );

    const isStale = ageMs > STALE_AFTER_MS;

    // This is an API-level freshness status, not a database status.
    // Preserve the actual database status separately for auditability.
    const effectiveStatus =
      isStale && asset.status === 'AVAILABLE'
        ? 'STALE'
        : asset.status;

    reply.header(
      'Cache-Control',
      'public, max-age=30, stale-while-revalidate=60',
    );
    reply.header('Content-Type', 'application/json; charset=utf-8');

    return {
      schemaVersion: '1.0.0',
      id: asset.id,
      name: asset.name,
      description: asset.description,
      region: asset.region,

      provider: {
        key: asset.provider.key,
        name: asset.provider.name,
        status: asset.provider.status,
      },

      providerOffer: {
        externalId: asset.externalAssetId,
        hourlyPriceUsd:
          typeof details.hourlyPriceUsd === 'number'
            ? details.hourlyPriceUsd
            : null,
        reliability:
          typeof details.reliability === 'number'
            ? details.reliability
            : null,
        gpuMemoryMb:
          typeof details.gpuMemoryMb === 'number'
            ? details.gpuMemoryMb
            : null,
        gpuCount:
          typeof details.gpuCount === 'number'
            ? details.gpuCount
            : null,
      },

      gpus: asset.gpuDevices.map((gpu) => ({
        model: gpu.model,
        memoryGb: gpu.memoryGb,
        count: gpu.count,
      })),

      // Effective API status reflects freshness without modifying PostgreSQL.
      status: effectiveStatus,

      dataQuality: {
        source: 'provider-synchronized-database',
        isStale,
        ageSeconds: Math.floor(ageMs / 1000),
        staleAfterSeconds: STALE_AFTER_MS / 1000,
        recordedStatus: asset.status,
        lastSeenAt: asset.lastSeenAt.toISOString(),
        resourceUpdatedAt:
          offerResource?.updatedAt.toISOString() ?? null,
        note:
          'STALE means this offer has not been observed recently; it does not prove the provider has removed it. A provider offer is not proof of ownership, a reserved instance, realized revenue, or guaranteed availability.',
      },

      updatedAt: asset.updatedAt.toISOString(),
    };
  });
}
