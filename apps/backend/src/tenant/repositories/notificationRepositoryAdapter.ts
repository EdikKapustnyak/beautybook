import { notificationRepository } from './notificationRepository.js';
import type { NotificationRecord, NotificationRepositoryPort } from './notificationTypes.js';

function toNotificationRecord(doc: {
  _id: unknown;
  companyId: unknown;
  bookingId?: unknown;
  type: NotificationRecord['type'];
  channel: NotificationRecord['channel'];
  recipient: string;
  body: string;
  dedupeKey: string;
  status: NotificationRecord['status'];
  attempts: number;
  maxAttempts: number;
  providerMessageId?: string;
  scheduledAt: Date;
  sentAt?: Date;
  failureReason?: string;
}): NotificationRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    bookingId: doc.bookingId ? String(doc.bookingId) : undefined,
    type: doc.type,
    channel: doc.channel,
    recipient: doc.recipient,
    body: doc.body,
    dedupeKey: doc.dedupeKey,
    status: doc.status,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    providerMessageId: doc.providerMessageId,
    scheduledAt: doc.scheduledAt,
    sentAt: doc.sentAt,
    failureReason: doc.failureReason,
  };
}

export const mongoNotificationRepositoryPort: NotificationRepositoryPort = {
  async findOrCreate(companyId, data) {
    const doc = await notificationRepository.findOrCreateInCompany(companyId, data);
    return toNotificationRecord(doc);
  },
  async findById(id) {
    const doc = await notificationRepository.findById(id);
    return doc ? toNotificationRecord(doc) : null;
  },
  async claimForSending(id) {
    const doc = await notificationRepository.claimForSending(id);
    return doc ? toNotificationRecord(doc) : null;
  },
  async markSent(id, providerMessageId) {
    return notificationRepository.markSent(id, providerMessageId);
  },
  async markFailed(id, failureReason) {
    await notificationRepository.markFailed(id, failureReason);
  },
};
