import { Worker, type Job } from 'bullmq';

import { notificationService } from '../../tenant/services/notificationService.instance.js';
import { QUEUE_NAMES } from './queues.js';
import { redisConnection } from './redisConnection.js';

export interface NotificationJobData {
  notificationId: string;
}

export function startNotificationWorker(): Worker<NotificationJobData> {
  return new Worker<NotificationJobData>(
    QUEUE_NAMES.notifications,
    async (job: Job<NotificationJobData>) => {
      await notificationService.send(job.data.notificationId);
    },
    { connection: redisConnection },
  );
}
