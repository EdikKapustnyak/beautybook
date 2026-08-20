import type { SmsProviderPort } from '../../shared/sms/smsProviderPort.js';
import type { NotificationType } from '../models/notification.model.js';
import type {
  NotificationRecord,
  NotificationRepositoryPort,
} from '../repositories/notificationTypes.js';

export interface NotificationServiceDeps {
  notificationRepo: NotificationRepositoryPort;
  smsProvider: SmsProviderPort;
}

export interface SendResult {
  sent: boolean;
  /** True when this call was a safe no-op — already sent/sending, or a duplicate job that lost the claim race. */
  skipped: boolean;
}

export function createNotificationService(deps: NotificationServiceDeps) {
  const { notificationRepo, smsProvider } = deps;

  return {
    /**
     * Idempotent by `dedupeKey` — calling this twice for the same
     * logical notification (e.g. a BullMQ job retried after a crash, or
     * enqueued twice by mistake) returns the SAME record both times,
     * never creates a duplicate. See dev-tasks.md §16 "duplicate job".
     */
    async enqueue(
      companyId: string,
      data: {
        bookingId?: string;
        type: NotificationType;
        recipient: string;
        body: string;
        dedupeKey: string;
        scheduledAt: Date;
      },
    ): Promise<NotificationRecord> {
      return notificationRepo.findOrCreate(companyId, data);
    },

    /**
     * The actual send step — called by the BullMQ worker. `claimForSending`
     * is the atomic guard: if two workers (or a retried job) both try to
     * send the same notification, only one can transition it out of
     * pending/failed into sending, so only one ever actually calls the
     * SMS provider. A provider failure marks the record `failed` (still
     * retryable, up to maxAttempts) and re-throws so BullMQ's own
     * retry/backoff policy decides what happens next.
     */
    async send(notificationId: string): Promise<SendResult> {
      const claimed = await notificationRepo.claimForSending(notificationId);
      if (!claimed) {
        return { sent: false, skipped: true };
      }

      try {
        const result = await smsProvider.sendSms(claimed.recipient, claimed.body);
        await notificationRepo.markSent(notificationId, result.providerMessageId);
        return { sent: true, skipped: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error';
        await notificationRepo.markFailed(notificationId, message);
        throw error;
      }
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
