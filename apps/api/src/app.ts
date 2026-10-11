import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { ZodError } from 'zod';

import type { ComputeProvider } from './providers/ComputeProvider.js';
import type { PublicClient } from 'viem';
import { VastAIProvider } from './providers/vast/VastAIProvider.js';
import { loadEnv, type AppEnv } from './config/env.js';
import { AppError } from './errors/AppError.js';
import prismaPlugin from './plugins/prisma.js';
import healthRoutes from './routes/health.js';
import v1Routes from './routes/v1/index.js';
import chainRoutes from './routes/v1/chain.js';
import providerRoutes from './routes/v1/providers.js';
import revenueRoutes from './routes/v1/revenue.js';
import metadataRoutes from './routes/metadata.js';

export function buildApp(
  options: {
    providerConfigured?: boolean;
    registerPrisma?: boolean;
    env?: AppEnv;
    computeProvider?: ComputeProvider;
    revenuePublicClient?: PublicClient;
  } = {},
) {
  const env = options.env ?? loadEnv(process.env);

  const allowedOrigins = (
  Array.isArray(env.CORS_ORIGIN)
    ? env.CORS_ORIGIN.join(',')
    : env.CORS_ORIGIN
  )
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'headers.authorization',
          'headers.cookie',
          '*.password',
          '*.apiKey',
          '*.privateKey',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: 'x-request-id',
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log[error.statusCode >= 500 ? 'error' : 'warn'](
        { err: error, code: error.code },
        'Application request error',
      );

      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.expose
            ? error.message
            : 'An internal error occurred',
        },
        requestId: request.id,
      });
    }

    if (error instanceof ZodError) {
      request.log.warn(
        { err: error },
        'Request validation failed',
      );

      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        },
        requestId: request.id,
      });
    }

    const statusCode =
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : 500;

    request.log.error(
      { err: error, statusCode },
      'Unhandled request error',
    );

    return reply.code(statusCode).send({
      error: {
        code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message:
          statusCode === 404
            ? 'The requested resource was not found'
            : statusCode < 500 && error instanceof Error
              ? error.message
              : 'An internal error occurred',
      },
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
      requestId: request.id,
    });
  });

  app.register(helmet);
  app.register(metadataRoutes);

  app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
  });

  app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
  });

  app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Tokenized Compute Yield API',
        description:
          'Versioned API for the Tokenized Compute Yield platform.',
        version: '1.0.0',
      },
      tags: [
        {
          name: 'health',
          description: 'Service health and readiness',
        },
        {
          name: 'system',
          description: 'API information',
        },
      ],
    },
  });

  app.register(swaggerUI, {
    routePrefix: '/docs',
  });

  if (options.registerPrisma ?? env.NODE_ENV !== 'test') {
    app.register(prismaPlugin);
  }

  app.register(healthRoutes);

  app.register(v1Routes, {
    prefix: '/api/v1',
  });

  app.register(chainRoutes, {
    prefix: '/api/v1/chain',
    env,
  });

  app.register(revenueRoutes, {
    prefix: '/api/v1/revenue',
    env,
    publicClient: options.revenuePublicClient,
  });

  const computeProvider =
    options.computeProvider ??
    new VastAIProvider({
      apiKey: env.VAST_API_KEY,
      baseUrl: env.VAST_API_URL,
    });

  app.register(providerRoutes, {
    prefix: '/api/v1/providers',
    provider: computeProvider,
    configured:
      options.providerConfigured ?? Boolean(env.VAST_API_KEY),
    syncApiKey: env.SYNC_API_KEY,
  });

  return app;
}

