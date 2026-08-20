import { randomUUID } from 'node:crypto';

import type {
  NotificationRecord,
  NotificationRepositoryPort,
} from '../../repositories/notificationTypes.js';

export function createInMemoryNotificationRepo(): NotificationRepositoryPort {
  const records = new Map<string, NotificationRecord>();
  const byDedupeKey = new Map<string, string>();

  return {
    async findOrCreate(companyId, data) {
      const existingId = byDedupeKey.get(data.dedupeKey);
      if (existingId) {
        const existing = records.get(existingId);
        if (existing) {
          return existing;
        }
      }
      const record: NotificationRecord = {
        id: randomUUID(),
        companyId,
        channel: 'sms',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        ...data,
      };
      records.set(record.id, record);
      byDedupeKey.set(data.dedupeKey, record.id);
      return record;
    },

    async findById(id) {
      return records.get(id) ?? null;
    },

    async claimForSending(id) {
      const record = records.get(id);
      if (!record) {
        return null;
      }
      const claimable = ['pending', 'failed'].includes(record.status);
      const underMaxAttempts = record.attempts < record.maxAttempts;
      if (!claimable || !underMaxAttempts) {
        return null;
      }
      const updated: NotificationRecord = {
        ...record,
        status: 'sending',
        attempts: record.attempts + 1,
      };
      records.set(id, updated);
      return updated;
    },

    async markSent(id, providerMessageId) {
      const record = records.get(id);
      if (!record || record.status !== 'sending') {
        return false;
      }
      records.set(id, { ...record, status: 'sent', sentAt: new Date(), providerMessageId });
      return true;
    },

    async markFailed(id, failureReason) {
      const record = records.get(id);
      if (!record || record.status !== 'sending') {
        return;
      }
      records.set(id, { ...record, status: 'failed', failureReason });
    },
  };
}
