
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComputeProvider } from '../src/providers/ComputeProvider.js';
import { ProviderError } from '../src/providers/vast/VastAIProvider.js';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

describe('Provider API routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createProvider(
    overrides: Partial<ComputeProvider> = {},
  ): ComputeProvider {
    return {
      name: 'vast',
      searchOffers: vi.fn().mockResolvedValue([
        {
          id: '123',
          provider: 'vast',
          gpuName: 'RTX 4090',
          gpuCount: 1,
          hourlyPriceUsd: 0.45,
          gpuMemoryMb: 24576,
          reliability: 0.99,
        },
      ]),
      healthCheck: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  function createApp(
    provider: ComputeProvider,
    configured = true,
  ) {
    const env = parseEnv({ NODE_ENV: 'test' });

    return buildApp({
      env,
      registerPrisma: false,
      computeProvider: provider,
    });
  }

  it('lists the Vast.ai provider without exposing credentials', async () => {
    const provider = createProvider();
    const app = createApp(provider, false);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/providers',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        providers: [
          {
            id: 'vast',
            capabilities: {
              offerSearch: true,
              instanceManagement: false,
            },
          },
        ],
      });

      expect(response.body).not.toContain('test-api-key');
    } finally {
      await app.close();
    }
  });

  it('returns normalized offers and forwards the requested limit', async () => {
    const provider = createProvider();
    const app = createApp(provider);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/providers/vast/offers?limit=5',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        provider: 'vast',
        count: 1,
        offers: [{ id: '123', gpuName: 'RTX 4090' }],
      });

      expect(provider.searchOffers).toHaveBeenCalledWith({ limit: 5 });
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid offer limit', async () => {
    const provider = createProvider();
    const app = createApp(provider);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/providers/vast/offers?limit=100',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      expect(provider.searchOffers).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns a safe service error when the provider is not configured', async () => {
    const provider = createProvider({
      searchOffers: vi.fn().mockRejectedValue(
        new ProviderError('Vast.ai integration is not configured', 503),
      ),
    });

    const app = createApp(provider, false);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/providers/vast/offers',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.body).not.toContain('API key');
    } finally {
      await app.close();
    }
  });

  it('does not expose upstream error details', async () => {
    const provider = createProvider({
      searchOffers: vi.fn().mockRejectedValue(
        new ProviderError('private upstream response', 502),
      ),
    });

    const app = createApp(provider);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/providers/vast/offers',
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe('UPSTREAM_ERROR');
      expect(response.body).not.toContain('private upstream response');
    } finally {
      await app.close();
    }
  });
});
