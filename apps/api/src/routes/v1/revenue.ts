import type { FastifyInstance } from 'fastify';
import {
  createPublicClient,
  defineChain,
  http,
  getAddress,
  isAddress,
  type Address,
  type PublicClient,
} from 'viem';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';

const ABI = [{"type":"constructor","inputs":[{"name":"admin","type":"address","internalType":"address"}],"stateMutability":"nonpayable"},{"type":"function","name":"CLAIM_PERIOD","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"DEFAULT_ADMIN_ROLE","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"RECOVERY_DELAY","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"REVENUE_MANAGER_ROLE","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"claim","inputs":[{"name":"distributionId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"claimAmount","type":"uint256","internalType":"uint256"}],"stateMutability":"nonpayable"},{"type":"function","name":"claimedAmount","inputs":[{"name":"distributionId","type":"uint256","internalType":"uint256"},{"name":"account","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"deactivateDistribution","inputs":[{"name":"distributionId","type":"uint256","internalType":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"depositRevenue","inputs":[{"name":"token","type":"address","internalType":"address"},{"name":"revenueToken","type":"address","internalType":"address"},{"name":"snapshotBlock","type":"uint256","internalType":"uint256"},{"name":"amount","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"distributionId","type":"uint256","internalType":"uint256"}],"stateMutability":"nonpayable"},{"type":"function","name":"getDistribution","inputs":[{"name":"distributionId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"","type":"tuple","internalType":"struct RevenueDistributor.Distribution","components":[{"name":"distributionId","type":"uint256","internalType":"uint256"},{"name":"token","type":"address","internalType":"address"},{"name":"revenueToken","type":"address","internalType":"address"},{"name":"snapshotBlock","type":"uint256","internalType":"uint256"},{"name":"totalSupply","type":"uint256","internalType":"uint256"},{"name":"amount","type":"uint256","internalType":"uint256"},{"name":"amountPerToken","type":"uint256","internalType":"uint256"},{"name":"claimedAmount","type":"uint256","internalType":"uint256"},{"name":"createdAt","type":"uint64","internalType":"uint64"},{"name":"active","type":"bool","internalType":"bool"},{"name":"claimDeadline","type":"uint64","internalType":"uint64"},{"name":"recovered","type":"bool","internalType":"bool"}]}],"stateMutability":"view"},{"type":"function","name":"getRoleAdmin","inputs":[{"name":"role","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"grantRole","inputs":[{"name":"role","type":"bytes32","internalType":"bytes32"},{"name":"account","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"hasRole","inputs":[{"name":"role","type":"bytes32","internalType":"bytes32"},{"name":"account","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"nextDistributionId","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"pause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"paused","inputs":[],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"recoverUnclaimedRevenue","inputs":[{"name":"distributionId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"amount","type":"uint256","internalType":"uint256"}],"stateMutability":"nonpayable"},{"type":"function","name":"renounceRole","inputs":[{"name":"role","type":"bytes32","internalType":"bytes32"},{"name":"callerConfirmation","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"revokeRole","inputs":[{"name":"role","type":"bytes32","internalType":"bytes32"},{"name":"account","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"setTreasury","inputs":[{"name":"newTreasury","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"supportsInterface","inputs":[{"name":"interfaceId","type":"bytes4","internalType":"bytes4"}],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"treasury","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},{"type":"function","name":"unpause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},{"type":"event","name":"DistributionDeactivated","inputs":[{"name":"distributionId","type":"uint256","indexed":true,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"Paused","inputs":[{"name":"account","type":"address","indexed":false,"internalType":"address"}],"anonymous":false},{"type":"event","name":"RevenueClaimed","inputs":[{"name":"distributionId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"account","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"RevenueDeposited","inputs":[{"name":"distributionId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"token","type":"address","indexed":true,"internalType":"address"},{"name":"revenueToken","type":"address","indexed":true,"internalType":"address"},{"name":"snapshotBlock","type":"uint256","indexed":false,"internalType":"uint256"},{"name":"totalSupply","type":"uint256","indexed":false,"internalType":"uint256"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"RoleAdminChanged","inputs":[{"name":"role","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"previousAdminRole","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"newAdminRole","type":"bytes32","indexed":true,"internalType":"bytes32"}],"anonymous":false},{"type":"event","name":"RoleGranted","inputs":[{"name":"role","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"account","type":"address","indexed":true,"internalType":"address"},{"name":"sender","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"event","name":"RoleRevoked","inputs":[{"name":"role","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"account","type":"address","indexed":true,"internalType":"address"},{"name":"sender","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"event","name":"TreasuryUpdated","inputs":[{"name":"oldTreasury","type":"address","indexed":true,"internalType":"address"},{"name":"newTreasury","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"event","name":"UnclaimedRevenueRecovered","inputs":[{"name":"distributionId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"treasury","type":"address","indexed":true,"internalType":"address"},{"name":"amount","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"Unpaused","inputs":[{"name":"account","type":"address","indexed":false,"internalType":"address"}],"anonymous":false},{"type":"error","name":"AccessControlBadConfirmation","inputs":[]},{"type":"error","name":"AccessControlUnauthorizedAccount","inputs":[{"name":"account","type":"address","internalType":"address"},{"name":"neededRole","type":"bytes32","internalType":"bytes32"}]},{"type":"error","name":"AlreadyClaimed","inputs":[]},{"type":"error","name":"AlreadyRecovered","inputs":[]},{"type":"error","name":"ClaimDeadlinePassed","inputs":[]},{"type":"error","name":"DistributionInactive","inputs":[]},{"type":"error","name":"EnforcedPause","inputs":[]},{"type":"error","name":"ExpectedPause","inputs":[]},{"type":"error","name":"InvalidAdmin","inputs":[]},{"type":"error","name":"InvalidAmount","inputs":[]},{"type":"error","name":"InvalidDistribution","inputs":[]},{"type":"error","name":"InvalidRevenueToken","inputs":[]},{"type":"error","name":"InvalidSnapshot","inputs":[]},{"type":"error","name":"InvalidToken","inputs":[]},{"type":"error","name":"InvalidTreasury","inputs":[]},{"type":"error","name":"NothingToClaim","inputs":[]},{"type":"error","name":"RecoveryTooEarly","inputs":[]},{"type":"error","name":"SafeERC20FailedOperation","inputs":[{"name":"token","type":"address","internalType":"address"}]}];

export default async function revenueRoutes(
  app: FastifyInstance,
  options: {
    env: AppEnv;
    publicClient?: PublicClient;
  },
) {
  const { env } = options;

  const client = options.publicClient ?? createPublicClient({
    chain: defineChain({
      id: env.CHAIN_ID,
      name: 'Monad',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [env.RPC_URL] } },
    }),
    transport: http(env.RPC_URL, { timeout: 10_000, retryCount: 2 }),
  });

  function distributorAddress(): Address {
    const address = env.REVENUE_DISTRIBUTOR_ADDRESS;
    if (!address || !isAddress(address)) {
      throw new Error('Revenue distributor is not configured');
    }
    return getAddress(address);
  }

  app.get('/status', async (_request, reply) => {
    try {
      const address = distributorAddress();
      const [chainId, code] = await Promise.all([
        client.getChainId(),
        client.getCode({ address }),
      ]);

      if (chainId !== env.CHAIN_ID || !code || code === '0x') {
        return reply.code(503).send({
          error: { code: 'REVENUE_CONTRACT_UNAVAILABLE' },
        });
      }

      const [treasury, claimPeriod, recoveryDelay, paused, nextId] =
        await Promise.all([
          client.readContract({ address, abi: ABI, functionName: 'treasury' }),
          client.readContract({ address, abi: ABI, functionName: 'CLAIM_PERIOD' }),
          client.readContract({ address, abi: ABI, functionName: 'RECOVERY_DELAY' }),
          client.readContract({ address, abi: ABI, functionName: 'paused' }),
          client.readContract({ address, abi: ABI, functionName: 'nextDistributionId' }),
        ]);

      return {
        chainId,
        address,
        treasury,
        claimPeriodSeconds: BigInt(claimPeriod as bigint).toString(),
        recoveryDelaySeconds: BigInt(recoveryDelay as bigint).toString(),
        paused,
        nextDistributionId: BigInt(nextId as bigint).toString(),
        distributionCount: BigInt(nextId as bigint) > 0n ? (BigInt(nextId as bigint) - 1n).toString() : '0',
      };
    } catch (error) {
      requestError(app, error, 'Revenue status query failed');
      return reply.code(503).send({
        error: { code: 'REVENUE_READ_FAILED', message: 'Could not read revenue contract' },
      });
    }
  });

  app.get('/distributions/:id', async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive().safe(),
    }).parse(request.params);

    try {
      const address = distributorAddress();
      const nextId = await client.readContract({
        address, abi: ABI, functionName: 'nextDistributionId',
      });

      if (BigInt(params.id) >= BigInt(nextId as bigint)) {
        return reply.code(404).send({
          error: { code: 'DISTRIBUTION_NOT_FOUND' },
        });
      }

      const distribution = await client.readContract({
        address,
        abi: ABI,
        functionName: 'getDistribution',
        args: [BigInt(params.id)],
      });

      const raw = distribution as {
        distributionId: bigint;
        token: Address;
        revenueToken: Address;
        snapshotBlock: bigint;
        totalSupply: bigint;
        amount: bigint;
        amountPerToken: bigint;
        claimedAmount: bigint;
        createdAt: bigint;
        active: boolean;
        claimDeadline: bigint;
        recovered: boolean;
      };

      return {
        distributionId: params.id,
        distribution: {
          distributionId: raw.distributionId.toString(),
          token: raw.token,
          revenueToken: raw.revenueToken,
          snapshotBlock: raw.snapshotBlock.toString(),
          totalSupply: raw.totalSupply.toString(),
          amount: raw.amount.toString(),
          amountPerToken: raw.amountPerToken.toString(),
          claimedAmount: raw.claimedAmount.toString(),
          createdAt: raw.createdAt.toString(),
          active: raw.active,
          claimDeadline: raw.claimDeadline.toString(),
          recovered: raw.recovered,
        },
      };
    } catch (error) {
      requestError(app, error, 'Revenue distribution query failed');
      return reply.code(503).send({
        error: { code: 'REVENUE_READ_FAILED', message: 'Could not read distribution' },
      });
    }
  });

  app.get('/claims/:id/:account', async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive().safe(),
      account: z.string().refine(isAddress, 'Invalid account address'),
    }).parse(request.params);

    try {
      const address = distributorAddress();
      const nextId = await client.readContract({
        address, abi: ABI, functionName: 'nextDistributionId',
      });

      if (BigInt(params.id) >= BigInt(nextId as bigint)) {
        return reply.code(404).send({
          error: { code: 'DISTRIBUTION_NOT_FOUND' },
        });
      }

      const amount = await client.readContract({
        address,
        abi: ABI,
        functionName: 'claimedAmount',
        args: [BigInt(params.id), getAddress(params.account)],
      });

      return {
        distributionId: params.id,
        account: getAddress(params.account),
        claimedAmount: BigInt(amount as bigint).toString(),
      };
    } catch (error) {
      requestError(app, error, 'Revenue claim query failed');
      return reply.code(503).send({
        error: { code: 'REVENUE_READ_FAILED', message: 'Could not read claim amount' },
      });
    }
  });
}

function requestError(
  app: FastifyInstance,
  error: unknown,
  message: string,
) {
  app.log.error({ err: error }, message);
}
