
import type { FastifyInstance } from 'fastify';
import { inspectChain } from '../../services/chain-client.js';
import type { AppEnv } from '../../config/env.js';

export default async function chainRoutes(
  app: FastifyInstance,
  options: { env: AppEnv },
) {
  app.get('/status', async (_request, reply) => {
    try {
      const status = await inspectChain(options.env);

      if (!status.connected) {
        return reply.code(503).send({
          error: {
            code: 'CHAIN_ID_MISMATCH',
            message: 'Connected RPC returned an unexpected chain ID',
          },
        });
      }

      return status;
    } catch (error) {
      app.log.error(
        { err: error },
        'Monad connectivity check failed',
      );

      return reply.code(503).send({
        error: {
          code: 'CHAIN_UNAVAILABLE',
          message: 'Blockchain RPC is unavailable',
        },
      });
    }
  });
}
