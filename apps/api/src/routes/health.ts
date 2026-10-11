
import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'tokenized-compute-yield-api',
  }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'connected',
      };
    } catch (error) {
      app.log.error({ err: error }, 'Database readiness check failed');

      return reply.code(503).send({
        status: 'error',
        database: 'unavailable',
      });
    }
  });
}
