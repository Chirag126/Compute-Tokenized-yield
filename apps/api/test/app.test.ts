
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('API application', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the service health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'tokenized-compute-yield-api',
    });
  });

  it('returns API version information', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: 'tokenized-compute-yield-api',
      version: 'v1',
    });
  });

  it('returns a consistent 404 response for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
    expect(response.json().requestId).toBeTruthy();
  });

  it('sets security headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows the configured frontend origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  it('serves the OpenAPI document', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json();

    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('Tokenized Compute Yield API');
    expect(document.paths['/health']).toBeDefined();
    expect(document.paths['/api/v1/']).toBeDefined();
  });
});
