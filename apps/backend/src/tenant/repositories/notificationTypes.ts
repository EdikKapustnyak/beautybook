import type {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../models/notification.model.js';

export interface NotificationRecord {
  id: string;
  companyId: string;
  bookingId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  body: string;
  dedupeKey: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  providerMessageId?: string;
  scheduledAt: Date;
  sentAt?: Date;
  failureReason?: string;
}

export interface NotificationRepositoryPort {
  /**
   * Idempotent by `dedupeKey`: if a notification with this key already
   * exists (e.g. the same reminder was enqueued twice), returns the
   * EXISTING record instead of creating a duplicate — this is what makes
   * "duplicate job" (dev-tasks.md §16) safe at the enqueue step.
   */
  findOrCreate(
    companyId: string,
    data: {
      bookingId?: string;
      type: NotificationType;
      recipient: string;
      body: string;
      dedupeKey: string;
      scheduledAt: Date;
    },
  ): Promise<NotificationRecord>;
  findById(id: string): Promise<NotificationRecord | null>;
  /**
   * Atomic: succeeds only if status is `pending` or `failed` AND attempts
   * are still under `maxAttempts` — sets status to `sending` and
   * increments attempts. Returns null otherwise (already sent/sending, or
   * exhausted retries). This is what makes a duplicate/concurrent SEND
   * attempt (not just a duplicate enqueue) safe.
   */
  claimForSending(id: string): Promise<NotificationRecord | null>;
  /** Atomic: succeeds only if status is `sending` — idempotent against a duplicate provider callback. */
  markSent(id: string, providerMessageId: string): Promise<boolean>;
  markFailed(id: string, failureReason: string): Promise<void>;
}
