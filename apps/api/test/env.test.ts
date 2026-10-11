
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('API environment configuration', () => {
  it('uses safe defaults in test mode', () => {
    const env = parseEnv({ NODE_ENV: 'test' });

    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('parses valid configuration values', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      PORT: '4100',
      DATABASE_URL:
        'postgresql://tcy:example@localhost:5432/tokenized_compute_yield',
      CORS_ORIGIN:
        'http://localhost:5173,https://example.com',
      LOG_LEVEL: 'debug',
    });

    expect(env.PORT).toBe(4100);
    expect(env.DATABASE_URL).toContain('localhost:5432');
    expect(env.CORS_ORIGIN).toEqual([
      'http://localhost:5173',
      'https://example.com',
    ]);
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('rejects an invalid port', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        PORT: '70000',
      }),
    ).toThrow(/PORT/);
  });

  it('rejects an invalid URL', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        RPC_URL: 'not-a-url',
      }),
    ).toThrow(/RPC_URL/);
  });

  it('requires the database URL outside test mode', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid CORS origin', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        CORS_ORIGIN: 'not-a-valid-origin',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });
});
