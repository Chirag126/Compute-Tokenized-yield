import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const ADDRESS = '0x61283d563684E01A92650eb5a76dc26F42D9cDA0';
const TREASURY = '0x125f33A973257b472194676E760aa1afcBEB8cE5';
const ACCOUNT = '0x0000000000000000000000000000000000000001';

function makeClient(overrides: Record<string, unknown> = {}) {
  const client = {
    getChainId: vi.fn().mockResolvedValue(10143),
    getCode: vi.fn().mockResolvedValue('0x6000'),
    readContract: vi.fn(async (args: { functionName: string }) => {
      switch (args.functionName) {
        case 'treasury': return TREASURY;
        case 'CLAIM_PERIOD': return 7_776_000n;
        case 'RECOVERY_DELAY': return 604_800n;
        case 'paused': return false;
        case 'nextDistributionId': return 1n;
        case 'claimedAmount': return 0n;
        default: throw new Error(`Unexpected function: ${args.functionName}`);
      }
    }),
    ...overrides,
  };

  return client as unknown as PublicClient;
}

function makeApp(client = makeClient()) {
  const env = parseEnv({
    NODE_ENV: 'test',
    REVENUE_DISTRIBUTOR_ADDRESS: ADDRESS,
  });

  return buildApp({
    env,
    registerPrisma: false,
    revenuePublicClient: client,
  });
}

describe('revenue routes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns distributor status', async () => {
    const app = makeApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/revenue/status',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.chainId).toBe(10143);
      expect(body.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
      expect(body.treasury.toLowerCase()).toBe(TREASURY.toLowerCase());
      expect(body.claimPeriodSeconds).toBe('7776000');
      expect(body.recoveryDelaySeconds).toBe('604800');
      expect(body.paused).toBe(false);
      expect(body.distributionCount).toBe('0');
    } finally {
      await app.close();
    }
  });

  it('returns 404 for a nonexistent distribution', async () => {
    const app = makeApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/revenue/distributions/1',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('DISTRIBUTION_NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it('returns 404 for claims on a nonexistent distribution', async () => {
    const app = makeApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/revenue/claims/1/${ACCOUNT}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('DISTRIBUTION_NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it('returns 503 when the chain read fails', async () => {
    const client = makeClient({
      getChainId: vi.fn().mockRejectedValue(new Error('RPC unavailable')),
    });
    const app = makeApp(client);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/revenue/status',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('REVENUE_READ_FAILED');
    } finally {
      await app.close();
    }
  });
  it('returns a distribution when it exists', async () => {
    const distribution = {
      distributionId: 1n,
      token: ADDRESS,
      revenueToken: TREASURY,
      snapshotBlock: 100n,
      totalSupply: 1000n,
      amount: 500n,
      amountPerToken: 500000000000000000n,
      claimedAmount: 0n,
      createdAt: 1000n,
      active: true,
      claimDeadline: 7777000n,
      recovered: false,
    };

    const client = makeClient({
      readContract: vi.fn(async (args: { functionName: string }) => {
        if (args.functionName === 'nextDistributionId') return 2n;
        if (args.functionName === 'getDistribution') return distribution;
        throw new Error(`Unexpected function: ${args.functionName}`);
      }),
    });
    const app = makeApp(client);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/revenue/distributions/1',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().distributionId).toBe(1);
      expect(response.json().distribution.active).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('returns the claim amount for an existing distribution', async () => {
    const client = makeClient({
      readContract: vi.fn(async (args: { functionName: string }) => {
        if (args.functionName === 'nextDistributionId') return 2n;
        if (args.functionName === 'claimedAmount') return 123n;
        throw new Error(`Unexpected function: ${args.functionName}`);
      }),
    });
    const app = makeApp(client);

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/revenue/claims/1/${ACCOUNT}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().distributionId).toBe(1);
      expect(response.json().claimedAmount).toBe('123');
    } finally {
      await app.close();
    }
  });
});


