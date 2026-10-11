
import { z } from 'zod';
import type {
  ComputeOffer,
  ComputeProvider,
  OfferSearchOptions,
} from '../ComputeProvider.js';

const offerSchema = z.object({
  id: z.union([z.string(), z.number()]),
  gpu_name: z.string().nullish(),
  num_gpus: z.number().finite().nullish(),
  dph_total: z.number().finite().nonnegative().nullish(),
  gpu_ram: z.number().finite().nonnegative().nullish(),
  reliability: z.number().finite().nullish(),
});

const offersResponseSchema = z.object({
  offers: z.array(z.unknown()),
});

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export interface VastAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class VastAIProvider implements ComputeProvider {
  readonly name = 'vast' as const;

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: VastAIProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.baseUrl = (
      options.baseUrl ?? 'https://console.vast.ai/api/v0'
    ).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8000;

    const baseUrl = new URL(this.baseUrl);

    if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
      throw new Error('Vast.ai API URL must use HTTPS');
    }
  }

  async searchOffers(
    options: OfferSearchOptions = {},
  ): Promise<ComputeOffer[]> {
    const limit = options.limit ?? 10;

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ProviderError(
        'Offer limit must be an integer between 1 and 50',
        400,
      );
    }

    const data = await this.request(
      'bundles/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rentable: { eq: true },
          verified: { eq: true },
          type: 'ondemand',
          limit,
        }),
      },
    );

    const response = offersResponseSchema.safeParse(data);

    if (!response.success) {
      throw new ProviderError(
        'Vast.ai returned an invalid offers response',
      );
    }

    const offers: ComputeOffer[] = [];

    for (const item of response.data.offers) {
      const parsed = offerSchema.safeParse(item);

      // Ignore malformed individual records rather than trusting their fields.
      if (!parsed.success) continue;

      const offer = parsed.data;

      offers.push({
        id: String(offer.id),
        provider: 'vast',
        gpuName: offer.gpu_name ?? null,
        gpuCount: offer.num_gpus ?? null,
        hourlyPriceUsd: offer.dph_total ?? null,
        gpuMemoryMb: offer.gpu_ram ?? null,
        reliability: offer.reliability ?? null,
      });
    }

    return offers;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.searchOffers({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    if (!this.apiKey) {
      throw new ProviderError(
        'Vast.ai integration is not configured',
        503,
      );
    }

    const url = `${this.baseUrl}/${path}`;

    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        // Do not expose the provider response body or credentials.
        throw new ProviderError(
          response.status === 401 || response.status === 403
            ? 'Vast.ai authentication failed'
            : response.status === 429
              ? 'Vast.ai rate limit reached'
              : 'Vast.ai request failed',
          response.status === 401 || response.status === 403
            ? 502
            : response.status === 429
              ? 503
              : 502,
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw new ProviderError(
          'Vast.ai returned invalid JSON',
          502,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      throw new ProviderError(
        'Vast.ai is unavailable or the request timed out',
        502,
        { cause: error },
      );
    }
  }
}
