import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { OtpModel } from '../otp.model.js';

function buildValidOtp(overrides: Record<string, unknown> = {}) {
  return new OtpModel({
    companyId: new Types.ObjectId(),
    phone: '+4791234567',
    purpose: 'booking_phone_verification',
    codeHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    maxAttempts: 5,
    ...overrides,
  });
}

describe('OtpModel validation', () => {
  it('accepts a well-formed OTP record', () => {
    const otp = buildValidOtp();
    expect(otp.validateSync()).toBeUndefined();
  });

  it('requires companyId, phone, purpose, codeHash, expiresAt, maxAttempts', () => {
    for (const field of ['companyId', 'phone', 'purpose', 'codeHash', 'expiresAt', 'maxAttempts']) {
      const otp = buildValidOtp({ [field]: undefined });
      expect(otp.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it('rejects an invalid purpose', () => {
    const otp = buildValidOtp({ purpose: 'made_up' });
    expect(otp.validateSync()?.errors.purpose).toBeDefined();
  });

  it('defaults attempts to 0', () => {
    const otp = buildValidOtp();
    expect(otp.attempts).toBe(0);
  });

  it('is unverified by default (verifiedAt unset)', () => {
    const otp = buildValidOtp();
    expect(otp.verifiedAt).toBeUndefined();
  });
});
