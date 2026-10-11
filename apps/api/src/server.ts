
import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';

let app: ReturnType<typeof buildApp> | undefined;

try {
  const env = loadEnv();

  app = buildApp({ env });

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });
} catch (error) {
  if (app) {
    try {
      await app.close();
    } catch {
      // Preserve the original startup error.
    }
  }

  if (error instanceof Error) {
    console.error(`API startup failed: ${error.message}`);
  } else {
    console.error('API startup failed due to an unknown error.');
  }

  process.exitCode = 1;
}
