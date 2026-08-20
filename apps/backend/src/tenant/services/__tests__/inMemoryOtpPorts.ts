import { randomUUID } from 'node:crypto';

import type { OtpRecord, OtpRepositoryPort } from '../../repositories/otpTypes.js';

export function createInMemoryOtpRepo(now: () => Date = () => new Date()): OtpRepositoryPort {
  const records = new Map<string, OtpRecord>();

  return {
    async create(companyId, data) {
      const record: OtpRecord = {
        id: randomUUID(),
        companyId,
        attempts: 0,
        createdAt: now(),
        ...data,
      };
      records.set(record.id, record);
      return record;
    },

    async findLatestByPhone(companyId, phone, purpose) {
      const matches = [...records.values()]
        .filter((r) => r.companyId === companyId && r.phone === phone && r.purpose === purpose)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    },

    async findById(otpId) {
      return records.get(otpId) ?? null;
    },

    async claimAttempt(otpId) {
      const record = records.get(otpId);
      if (!record) {
        return null;
      }
      const notExpired = record.expiresAt.getTime() > now().getTime();
      const notVerified = !record.verifiedAt;
      const underMaxAttempts = record.attempts < record.maxAttempts;
      if (!notExpired || !notVerified || !underMaxAttempts) {
        return null;
      }
      const updated: OtpRecord = { ...record, attempts: record.attempts + 1 };
      records.set(otpId, updated);
      return updated;
    },

    async markVerifiedIfUnverified(otpId) {
      const record = records.get(otpId);
      if (!record || record.verifiedAt) {
        return false;
      }
      records.set(otpId, { ...record, verifiedAt: new Date() });
      return true;
    },
  };
}
