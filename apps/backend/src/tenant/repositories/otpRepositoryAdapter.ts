import { otpRepository } from './otpRepository.js';
import type { OtpRecord, OtpRepositoryPort } from './otpTypes.js';

function toOtpRecord(doc: {
  _id: unknown;
  companyId: unknown;
  phone: string;
  purpose: OtpRecord['purpose'];
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verifiedAt?: Date;
  createdAt: Date;
}): OtpRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    phone: doc.phone,
    purpose: doc.purpose,
    codeHash: doc.codeHash,
    expiresAt: doc.expiresAt,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    verifiedAt: doc.verifiedAt,
    createdAt: doc.createdAt,
  };
}

export const mongoOtpRepositoryPort: OtpRepositoryPort = {
  async create(companyId, data) {
    const doc = await otpRepository.createInCompany(companyId, data);
    return toOtpRecord(doc);
  },
  async findLatestByPhone(companyId, phone, purpose) {
    const doc = await otpRepository.findLatestByPhoneInCompany(phone, purpose, companyId);
    return doc ? toOtpRecord(doc) : null;
  },
  async findById(otpId) {
    const doc = await otpRepository.findById(otpId);
    return doc ? toOtpRecord(doc) : null;
  },
  async claimAttempt(otpId) {
    const doc = await otpRepository.claimAttempt(otpId);
    return doc ? toOtpRecord(doc) : null;
  },
  async markVerifiedIfUnverified(otpId) {
    return otpRepository.markVerifiedIfUnverified(otpId);
  },
};
