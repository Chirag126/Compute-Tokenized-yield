import type { FastifyInstance } from 'fastify';

export default async function v1Routes(app: FastifyInstance) {
  app.get('/', async () => ({
    name: 'tokenized-compute-yield-api',
    version: 'v1',
  }));
}