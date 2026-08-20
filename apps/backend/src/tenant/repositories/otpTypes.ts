import type { OtpPurpose } from '../models/otp.model.js';

export interface OtpRecord {
  id: string;
  companyId: string;
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verifiedAt?: Date;
  createdAt: Date;
}

export interface OtpRepositoryPort {
  create(
    companyId: string,
    data: {
      phone: string;
      purpose: OtpPurpose;
      codeHash: string;
      expiresAt: Date;
      maxAttempts: number;
    },
  ): Promise<OtpRecord>;
  /** Most recent OTP request for this phone+purpose, regardless of status — used for the resend cooldown check. */
  findLatestByPhone(
    companyId: string,
    phone: string,
    purpose: OtpPurpose,
  ): Promise<OtpRecord | null>;
  findById(otpId: string): Promise<OtpRecord | null>;
  /**
   * Atomic: increments `attempts` ONLY if the record is not expired, not
   * already verified, and still under `maxAttempts`. Returns null if any
   * of those conditions fail — this single atomic step is what makes
   * concurrent verification attempts and brute-force lockout both
   * correct under a race (dev-tasks.md §15 "concurrent verification",
   * "brute force").
   */
  claimAttempt(otpId: string): Promise<OtpRecord | null>;
  /** Atomic: succeeds only if not already verified — makes the code single-use. */
  markVerifiedIfUnverified(otpId: string): Promise<boolean>;
}
