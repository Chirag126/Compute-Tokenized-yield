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
