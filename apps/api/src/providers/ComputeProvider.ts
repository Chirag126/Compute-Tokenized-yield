
export interface ComputeOffer {
  id: string;
  provider: 'vast';
  gpuName: string | null;
  gpuCount: number | null;
  hourlyPriceUsd: number | null;
  gpuMemoryMb: number | null;
  reliability: number | null;
}

export interface OfferSearchOptions {
  limit?: number;
}

export interface ComputeProvider {
  readonly name: string;

  searchOffers(
    options?: OfferSearchOptions,
  ): Promise<ComputeOffer[]>;

  healthCheck(): Promise<boolean>;
}
