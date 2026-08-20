import type { Server } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './db/connection.js';

async function main(): Promise<void> {
  await connectDB();

  const app = createApp();

  const server: Server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console -- intentional startup diagnostic
    console.log(`[backend] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console -- intentional shutdown diagnostic
    console.log(`[backend] received ${signal}, shutting down gracefully`);
    server.close(() => {
      // eslint-disable-next-line no-console -- intentional shutdown diagnostic
      console.log('[backend] HTTP server closed');
    });
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('[backend] fatal startup error', error);
  process.exit(1);
});
