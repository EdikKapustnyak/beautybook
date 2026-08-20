import { Worker } from 'bullmq';

import { bookingAttachmentService } from '../../tenant/services/bookingAttachmentService.instance.js';
import { cleanupQueue, QUEUE_NAMES } from './queues.js';
import { redisConnection } from './redisConnection.js';

const CLEANUP_REPEATABLE_JOB_ID = 'cleanup-expired-attachments-repeat';
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export function startCleanupWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.cleanup,
    async () => {
      await bookingAttachmentService.cleanupExpiredAttachments();
    },
    { connection: redisConnection },
  );
}

/**
 * Registers the repeatable cleanup job — idempotent to call on every
 * server start (`upsertJobScheduler` keys by `jobSchedulerId`, so this
 * never creates a growing pile of schedules). The standalone CLI script
 * (`npm run cleanup:attachments`) still works independently of this —
 * useful for an environment that hasn't set up the worker process yet, or
 * for an ad-hoc manual run.
 */
export async function registerCleanupRepeatableJob(): Promise<void> {
  await cleanupQueue.upsertJobScheduler(
    CLEANUP_REPEATABLE_JOB_ID,
    { every: CLEANUP_INTERVAL_MS },
    { name: 'cleanup-expired-attachments', data: {} },
  );
}
