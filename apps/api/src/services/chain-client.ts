import {
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
  type Address,
} from 'viem';
import type { AppEnv } from '../config/env.js';

export function createChainClient(
  env: AppEnv,
): PublicClient {
  const monad = defineChain({
    id: env.CHAIN_ID,
    name: 'Monad',
    nativeCurrency: {
      name: 'MON',
      symbol: 'MON',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [env.RPC_URL],
      },
    },
    blockExplorers: {
      default: {
        name: 'Monad Explorer',
        url: env.EXPLORER_URL,
      },
    },
  });

  return createPublicClient({
    chain: monad,
    transport: http(env.RPC_URL, {
      timeout: 10_000,
      retryCount: 2,
    }),
  });
}

export async function inspectChain(
  env: AppEnv,
) {
  const client = createChainClient(env);

  const [chainId, blockNumber] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
  ]);

  const addresses = {
    registry: env.REGISTRY_CONTRACT_ADDRESS as
      | Address
      | undefined,
    revenueDistributor:
      env.REVENUE_DISTRIBUTOR_ADDRESS as
        | Address
        | undefined,
  };

  const contracts = await Promise.all(
    Object.entries(addresses).map(
      async ([name, address]) => {
        if (!address) {
          return {
            name,
            configured: false,
            deployed: false,
          };
        }

        const bytecode =
          await client.getCode({ address });

        return {
          name,
          configured: true,
          deployed:
            bytecode !== undefined &&
            bytecode !== '0x',
          address,
        };
      },
    ),
  );

  return {
    chainId,
    expectedChainId: env.CHAIN_ID,
    connected: chainId === env.CHAIN_ID,
    blockNumber: blockNumber.toString(),
    contracts,
  };
}
