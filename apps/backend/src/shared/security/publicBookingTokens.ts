// apps/backend/src/shared/security/publicBookingTokens.ts
//
// ⚠️ RECONSTRUCTED, NOT RECOVERED. `npm run typecheck` confirmed this
// module does not exist in the applied project (TS2307 "Cannot find
// module"), and its 12 tests do not appear anywhere in the 47-file vitest
// run either. HANDOFF_1.md §5 describes this file as already written and
// partially test-verified in a prior session, but it evidently was never
// actually committed/applied — this is a fresh reconstruction from that
// description, not a recovery of the original bytes. Re-review this file
// with the same scrutiny as anything new, not as "already-approved code".
//
// Two signed, stateless JWTs for the public booking flow (HANDOFF_1.md §5,
// §6):
//   - Phone verification token (short TTL) — issued after a successful OTP
//     check, carries the verified phone as a claim so booking creation
//     never has to (and must never) trust a raw phone from the request
//     body.
//   - Booking management token (long TTL) — issued once at booking
//     creation, goes into the "manage your booking" SMS link. Deliberately
//     long-lived: protection against use-after-the-booking-is-over comes
//     from bookingService's own state machine (a completed/cancelled
//     booking simply can't transition again), not from token expiry.
//
// Security properties, both non-negotiable:
//   - A SEPARATE secret (PUBLIC_BOOKING_TOKEN_SECRET) from tenant/admin
//     JWT secrets — same trust-boundary-separation principle used
//     everywhere else in this project (security-measures.md §2/§24).
//   - Distinct `purpose` claims + explicit `algorithms: ['HS256']` on
//     verify — the latter is what defeats an `alg:none` forgery attempt
//     (jsonwebtoken only refuses unsigned tokens if the accepted
//     algorithms are pinned explicitly; omitting the `algorithms` option
//     on verify is the classic version of this vulnerability). The former
//     stops a valid phone-verification token from being replayed as a
//     booking-management token or vice versa ("token confusion").
//
// ASSUMPTION: `env.PUBLIC_BOOKING_TOKEN_SECRET` — import path/export name
// for the Zod-validated config object is inferred from README's
// "apps/backend/src/config/env.ts" reference, not confirmed directly.
// HANDOFF_1.md §5 also notes this env var itself still needs to be added
// by hand to env.ts/.env.example/.env/vitest.config.ts — if that hasn't
// been done yet, this file will fail at import time (Zod parse error at
// startup), not silently.

import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { UnauthorizedError } from '../errors/AppError.js';

const PHONE_VERIFICATION_TTL_SECONDS = 15 * 60;
const BOOKING_MANAGEMENT_TTL_SECONDS = 60 * 60 * 24 * 365;

const PHONE_VERIFICATION_PURPOSE = 'public_phone_verification' as const;
const BOOKING_MANAGEMENT_PURPOSE = 'public_booking_management' as const;

interface PhoneVerificationTokenPayload {
  purpose: typeof PHONE_VERIFICATION_PURPOSE;
  phone: string;
}

interface BookingManagementTokenPayload {
  purpose: typeof BOOKING_MANAGEMENT_PURPOSE;
  bookingId: string;
}

const INVALID_TOKEN_MESSAGE = 'Invalid or expired token.';

export function issuePhoneVerificationToken(input: { phone: string }): string {
  const payload: PhoneVerificationTokenPayload = {
    purpose: PHONE_VERIFICATION_PURPOSE,
    phone: input.phone,
  };
  return jwt.sign(payload, env.PUBLIC_BOOKING_TOKEN_SECRET, {
    algorithm: 'HS256',
    expiresIn: PHONE_VERIFICATION_TTL_SECONDS,
  });
}

export function verifyPhoneVerificationToken(token: string): { phone: string } {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.PUBLIC_BOOKING_TOKEN_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new UnauthorizedError(INVALID_TOKEN_MESSAGE);
  }

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    (decoded as { purpose?: unknown }).purpose !== PHONE_VERIFICATION_PURPOSE ||
    typeof (decoded as { phone?: unknown }).phone !== 'string'
  ) {
    // Covers both a garbage/foreign-secret token AND a valid
    // booking-management token replayed here — token-confusion defense.
    throw new UnauthorizedError(INVALID_TOKEN_MESSAGE);
  }

  return { phone: (decoded as PhoneVerificationTokenPayload).phone };
}

export function issueBookingManagementToken(input: { bookingId: string }): string {
  const payload: BookingManagementTokenPayload = {
    purpose: BOOKING_MANAGEMENT_PURPOSE,
    bookingId: input.bookingId,
  };
  return jwt.sign(payload, env.PUBLIC_BOOKING_TOKEN_SECRET, {
    algorithm: 'HS256',
    expiresIn: BOOKING_MANAGEMENT_TTL_SECONDS,
  });
}

export function verifyBookingManagementToken(token: string): { bookingId: string } {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.PUBLIC_BOOKING_TOKEN_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw new UnauthorizedError(INVALID_TOKEN_MESSAGE);
  }

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    (decoded as { purpose?: unknown }).purpose !== BOOKING_MANAGEMENT_PURPOSE ||
    typeof (decoded as { bookingId?: unknown }).bookingId !== 'string'
  ) {
    throw new UnauthorizedError(INVALID_TOKEN_MESSAGE);
  }

  return { bookingId: (decoded as BookingManagementTokenPayload).bookingId };
}
