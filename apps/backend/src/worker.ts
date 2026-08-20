import type { Worker } from 'bullmq';

import { env } from './config/env.js';
import { connectDB, disconnectDB } from './db/connection.js';
import { registerCleanupRepeatableJob, startCleanupWorker } from './shared/queue/cleanupWorker.js';
import { startNotificationWorker } from './shared/queue/notificationWorker.js';
import { redisConnection } from './shared/queue/redisConnection.js';
import { startReminderWorker } from './shared/queue/reminderWorker.js';

async function main(): Promise<void> {
  await connectDB();

  const workers: Worker[] = [
    startNotificationWorker(),
    startReminderWorker(),
    startCleanupWorker(),
  ];
  await registerCleanupRepeatableJob();

  // eslint-disable-next-line no-console -- intentional startup diagnostic
  console.log(`[worker] started ${workers.length} queue workers (${env.NODE_ENV})`);

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console -- intentional shutdown diagnostic
    console.log(`[worker] received ${signal}, shutting down gracefully`);
    await Promise.all(workers.map((worker) => worker.close()));
    await redisConnection.quit();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('[worker] fatal startup error', error);
  process.exit(1);
});
