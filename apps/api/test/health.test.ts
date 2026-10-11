
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import healthRoutes from '../src/routes/health.js';

describe('Health routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createTestApp(queryRaw: () => Promise<unknown>) {
    app = Fastify({ logger: false });

    app.decorate('prisma', {
      $queryRaw: queryRaw,
    } as never);

    await app.register(healthRoutes);
    await app.ready();

    return app;
  }

  it('reports database connected when the readiness query succeeds', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const testApp = await createTestApp(queryRaw);

    const response = await testApp.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when the readiness query fails', async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValue(new Error('Database unavailable'));
    const testApp = await createTestApp(queryRaw);

    const response = await testApp.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      database: 'unavailable',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
