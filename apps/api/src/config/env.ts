
import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load the root .env when running commands from apps/api.
// Existing environment variables take precedence over .env values.
loadDotenv({
  path: resolve(process.cwd(), '../../.env'),
  override: false,
});

const corsOriginSchema = z
  .string()
  .default('http://localhost:5173')
  .transform((value, ctx) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim());

    const isValid = origins.every((origin) => {
      try {
        const parsed = new URL(origin);

        return (
          (parsed.protocol === 'http:' ||
            parsed.protocol === 'https:') &&
          parsed.hostname.length > 0
        );
      } catch {
        return false;
      }
    });

    if (!isValid || origins.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message:
          'CORS_ORIGIN must contain valid HTTP or HTTPS origins',
      });

      return z.NEVER;
    }

    return origins;
  });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(4000),

  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().optional(),

  // Monad Testnet
  CHAIN_ID: z.coerce.number().int().positive().default(10143),

  RPC_URL: z
    .string()
    .url()
    .default('https://testnet-rpc.monad.xyz'),

  EXPLORER_URL: z
    .string()
    .url()
    .default('https://testnet.monadexplorer.com'),

  // Optional until the contracts are deployed.
  REGISTRY_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),

  REVENUE_DISTRIBUTOR_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),

  // Compute provider configuration
  VAST_API_URL: z.string().url().optional(),
  VAST_API_KEY: z.string().optional(),

  // Protects the provider-sync endpoint.
  SYNC_API_KEY: z.string().min(32).optional(),

  // Supports one or more comma-separated HTTP(S) origins.
  CORS_ORIGIN: corsOriginSchema,

  LOG_LEVEL: z
    .enum([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ])
    .default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnv {
  const parsed = envSchema.parse(source);

  if (
    parsed.NODE_ENV !== 'test' &&
    !parsed.DATABASE_URL
  ) {
    throw new Error(
      'DATABASE_URL is required outside test mode',
    );
  }

  return parsed;
}

export const loadEnv = parseEnv;

export const env = loadEnv();
