import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../errors/AppError.js';
import type { ComputeProvider } from '../../providers/ComputeProvider.js';
import { ProviderError } from '../../providers/vast/VastAIProvider.js';
import { syncComputeOffers } from '../../services/compute-sync.js';

interface ProviderRoutesOptions {
  provider: ComputeProvider;
  configured: boolean;
  syncApiKey?: string;
}

const offerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const syncBodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

function secretMatches(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export default async function providerRoutes(
  app: FastifyInstance,
  options: ProviderRoutesOptions,
) {
  app.get('/', async () => ({
    providers: [
      {
        id: 'vast',
        status: options.configured ? 'configured' : 'not_configured',
        capabilities: {
          offerSearch: true,
          instanceManagement: false,
          offerSynchronization: true,
        },
      },
    ],
  }));

  app.get('/vast/offers', async (request) => {
    const query = offerQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid offer search parameters',
      );
    }

    try {
      const offers = await options.provider.searchOffers({
        limit: query.data.limit,
      });

      return {
        provider: 'vast',
        count: offers.length,
        offers,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new AppError(
          error.statusCode === 503
            ? 'SERVICE_UNAVAILABLE'
            : 'UPSTREAM_ERROR',
          'Compute provider request failed',
          { cause: error },
        );
      }

      throw new AppError(
        'UPSTREAM_ERROR',
        'Compute provider request failed',
        { cause: error },
      );
    }
  });

  app.get('/vast/persisted-offers', async (request) => {
    const query = offerQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid persisted offer query parameters',
      );
    }

    try {
      const assets = await app.prisma.computeAsset.findMany({
        where: {
          deletedAt: null,
          provider: { key: 'vast' },
          resources: {
            some: { resourceType: 'provider_offer' },
          },
        },
        orderBy: { lastSeenAt: 'desc' },
        take: query.data.limit,
        include: {
          provider: {
            select: { key: true, name: true },
          },
          resources: {
            where: { resourceType: 'provider_offer' },
            take: 1,
            select: { details: true },
          },
          gpuDevices: {
            select: { model: true, memoryGb: true, count: true },
          },
        },
      });

      const offers = assets.map((asset) => {
        const rawDetails = asset.resources[0]?.details;
        const details =
          rawDetails !== null &&
          typeof rawDetails === 'object' &&
          !Array.isArray(rawDetails)
            ? rawDetails as Record<string, unknown>
            : {};

        const numericValue = (value: unknown): number | null => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
          }
          return null;
        };

        const gpu = asset.gpuDevices[0];

        return {
          id: asset.externalAssetId,
          externalAssetId: asset.externalAssetId,
          name: asset.name,
          provider: asset.provider.key,
          providerName: asset.provider.name,
          status: asset.status,
          region: asset.region,
          gpuName:
            gpu?.model ??
            (typeof details.gpuName === 'string' ? details.gpuName : null),
          gpuCount: gpu?.count ?? numericValue(details.gpuCount),
          gpuMemoryGb: gpu?.memoryGb ?? null,
          hourlyPriceUsd: numericValue(details.hourlyPriceUsd),
          reliability: numericValue(details.reliability),
          lastSeenAt: asset.lastSeenAt.toISOString(),
          updatedAt: asset.updatedAt.toISOString(),
        };
      });

      return {
        provider: 'vast',
        source: 'database',
        count: offers.length,
        offers,
      };
    } catch (error) {
      request.log.error(
        { err: error },
        'Failed to read persisted compute offers',
      );

      throw new AppError(
        'INTERNAL_ERROR',
        'Could not load persisted compute offers',
        { cause: error },
      );
    }
  });
  app.post('/vast/sync', async (request) => {
    if (!options.syncApiKey) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Provider synchronization is not configured',
      );
    }

    const suppliedKey = request.headers['x-sync-api-key'];

    if (
      typeof suppliedKey !== 'string' ||
      !secretMatches(options.syncApiKey, suppliedKey)
    ) {
      throw new AppError(
        'UNAUTHORIZED',
        'Invalid synchronization credentials',
      );
    }

    if (!options.configured) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Compute provider is not configured',
      );
    }

    const parsed = syncBodySchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid synchronization parameters',
      );
    }

    try {
      const result = await syncComputeOffers(
        app.prisma,
        options.provider,
        { limit: parsed.data.limit },
      );

      return {
        status: 'completed',
        synchronization: result,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new AppError(
          error.statusCode === 503
            ? 'SERVICE_UNAVAILABLE'
            : 'UPSTREAM_ERROR',
          'Compute provider synchronization failed',
          { cause: error },
        );
      }

      request.log.error(
        { err: error },
        'Compute offer synchronization failed',
      );

      throw new AppError(
        'INTERNAL_ERROR',
        'Compute offer synchronization failed',
        { cause: error },
      );
    }
  });
}

