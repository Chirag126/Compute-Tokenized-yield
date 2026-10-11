
import { describe, expect, it, vi } from 'vitest';
import {
  ProviderError,
  VastAIProvider,
} from '../src/providers/vast/VastAIProvider.js';

describe('VastAIProvider', () => {
  const baseUrl = 'https://console.vast.ai/api/v0';
  const apiKey = 'test-api-key';

  it('searches offers and normalizes the response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          offers: [
            {
              id: 123,
              gpu_name: 'RTX 4090',
              num_gpus: 1,
              dph_total: 0.45,
              gpu_ram: 24576,
              reliability: 0.99,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const provider = new VastAIProvider({
      apiKey,
      baseUrl,
      fetchImpl: fetchMock,
    });

    const offers = await provider.searchOffers({ limit: 5 });

    expect(offers).toEqual([
      {
        id: '123',
        provider: 'vast',
        gpuName: 'RTX 4090',
        gpuCount: 1,
        hourlyPriceUsd: 0.45,
        gpuMemoryMb: 24576,
        reliability: 0.99,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0];

    expect(String(url)).toBe(`${baseUrl}/bundles/`);
    expect(request?.method).toBe('POST');
    expect(
      new Headers(request?.headers).get('authorization'),
    ).toBe(`Bearer ${apiKey}`);
  });

  it('fails safely when the API key is missing', async () => {
    const provider = new VastAIProvider({
      baseUrl,
      fetchImpl: vi.fn<typeof fetch>(),
    });

    await expect(provider.searchOffers()).rejects.toMatchObject({
      name: 'ProviderError',
      statusCode: 503,
    });
  });

  it('rejects an invalid offer limit without making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new VastAIProvider({
      apiKey,
      baseUrl,
      fetchImpl: fetchMock,
    });

    await expect(
      provider.searchOffers({ limit: 100 }),
    ).rejects.toBeInstanceOf(ProviderError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles provider authentication failures without exposing the response body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('sensitive upstream details', { status: 401 }),
    );

    const provider = new VastAIProvider({
      apiKey,
      baseUrl,
      fetchImpl: fetchMock,
    });

    await expect(provider.searchOffers()).rejects.toThrow(
      'Vast.ai authentication failed',
    );
  });

  it('ignores malformed individual offer records', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          offers: [
            { id: 1, gpu_name: 'RTX 4090', dph_total: 0.5 },
            { gpu_name: 'missing id' },
          ],
        }),
        { status: 200 },
      ),
    );

    const provider = new VastAIProvider({
      apiKey,
      baseUrl,
      fetchImpl: fetchMock,
    });

    const offers = await provider.searchOffers();

    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe('1');
  });

  it('returns false from healthCheck when the provider fails', async () => {
    const provider = new VastAIProvider({
      apiKey,
      baseUrl,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(
        new Error('network failure'),
      ),
    });

    await expect(provider.healthCheck()).resolves.toBe(false);
  });

  it('rejects a malformed top-level offers response', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [],
      }),
      { status: 200 },
    ),
  );

  const provider = new VastAIProvider({
    apiKey,
    baseUrl,
    fetchImpl: fetchMock,
  });

  await expect(provider.searchOffers()).rejects.toMatchObject({
    name: 'ProviderError',
    message: 'Vast.ai returned an invalid offers response',
  });

  expect(fetchMock).toHaveBeenCalledOnce();
});
});
