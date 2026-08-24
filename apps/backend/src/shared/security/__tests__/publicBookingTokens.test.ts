// apps/backend/src/shared/security/__tests__/publicBookingTokens.test.ts
//
// Covers the same ground HANDOFF_1.md §5 describes for the original
// (never-actually-committed) version of this file: round-trip for both
// token types, wrong secret, expired token, purpose confusion (a valid
// token of one type rejected when verified as the other), garbage input,
// and an `alg:none` forgery attempt.
//
// REQUIRES: env.PUBLIC_BOOKING_TOKEN_SECRET set in the test environment
// (32+ chars) — per HANDOFF_1.md §5's still-pending manual step in
// vitest.config.ts. If that hasn't been added yet, every test below will
// fail at import time with a Zod config-parse error, not a test failure —
// that's a signal to go add the env var, not a bug in this file.

import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '../../../config/env.js';
import { UnauthorizedError } from '../../errors/AppError.js';
import {
  issuePhoneVerificationToken,
  verifyPhoneVerificationToken,
  issueBookingManagementToken,
  verifyBookingManagementToken,
} from '../publicBookingTokens.js';

describe('publicBookingTokens — phone verification token', () => {
  it('round-trips: issue then verify returns the original phone', () => {
    const token = issuePhoneVerificationToken({ phone: '+4791234567' });
    expect(verifyPhoneVerificationToken(token)).toEqual({ phone: '+4791234567' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign(
      { purpose: 'public_phone_verification', phone: '+4791234567' },
      'a-completely-different-secret-not-the-real-one',
      { algorithm: 'HS256', expiresIn: 900 },
    );
    expect(() => verifyPhoneVerificationToken(forged)).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { purpose: 'public_phone_verification', phone: '+4791234567' },
      env.PUBLIC_BOOKING_TOKEN_SECRET,
      { algorithm: 'HS256', expiresIn: -1 },
    );
    expect(() => verifyPhoneVerificationToken(expired)).toThrow(UnauthorizedError);
  });

  it('rejects a garbage/non-JWT string', () => {
    expect(() => verifyPhoneVerificationToken('not-a-jwt-at-all')).toThrow(UnauthorizedError);
  });

  it('rejects a valid booking-management token presented as a phone-verification token (token confusion)', () => {
    const managementToken = issueBookingManagementToken({ bookingId: '507f1f77bcf86cd799439011' });
    expect(() => verifyPhoneVerificationToken(managementToken)).toThrow(UnauthorizedError);
  });

  it('rejects an alg:none forged token even with a correct-shaped payload', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ purpose: 'public_phone_verification', phone: '+4791234567' }),
    ).toString('base64url');
    const forgedAlgNone = `${header}.${payload}.`;
    expect(() => verifyPhoneVerificationToken(forgedAlgNone)).toThrow(UnauthorizedError);
  });
});

describe('publicBookingTokens — booking management token', () => {
  it('round-trips: issue then verify returns the original bookingId', () => {
    const token = issueBookingManagementToken({ bookingId: '507f1f77bcf86cd799439011' });
    expect(verifyBookingManagementToken(token)).toEqual({ bookingId: '507f1f77bcf86cd799439011' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign(
      { purpose: 'public_booking_management', bookingId: '507f1f77bcf86cd799439011' },
      'a-completely-different-secret-not-the-real-one',
      { algorithm: 'HS256', expiresIn: 60 * 60 * 24 * 365 },
    );
    expect(() => verifyBookingManagementToken(forged)).toThrow(UnauthorizedError);
  });

  it('rejects a garbage/non-JWT string', () => {
    expect(() => verifyBookingManagementToken('not-a-jwt-at-all')).toThrow(UnauthorizedError);
  });

  it('rejects a valid phone-verification token presented as a booking-management token (token confusion)', () => {
    const phoneToken = issuePhoneVerificationToken({ phone: '+4791234567' });
    expect(() => verifyBookingManagementToken(phoneToken)).toThrow(UnauthorizedError);
  });

  it('rejects an alg:none forged token even with a correct-shaped payload', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        purpose: 'public_booking_management',
        bookingId: '507f1f77bcf86cd799439011',
      }),
    ).toString('base64url');
    const forgedAlgNone = `${header}.${payload}.`;
    expect(() => verifyBookingManagementToken(forgedAlgNone)).toThrow(UnauthorizedError);
  });
});
