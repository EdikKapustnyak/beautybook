import { randomInt } from 'node:crypto';

import { AppError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { hashOpaqueToken } from '../../shared/security/tokens.js';
import type { SmsProviderPort } from '../../shared/sms/smsProviderPort.js';
import type { OtpPurpose } from '../models/otp.model.js';
import type { OtpRepositoryPort } from '../repositories/otpTypes.js';

export interface OtpServiceDeps {
  otpRepo: OtpRepositoryPort;
  smsProvider: SmsProviderPort;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  now?: () => Date;
}

const GENERIC_VERIFY_ERROR = 'Invalid or expired code.';

/**
 * A 6-digit numeric code, generated with `crypto.randomInt` (uniformly
 * distributed, cryptographically strong) — not `Math.random()`. See
 * security-measures.md §14 "криптографически случайный".
 */
function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function otpLockedError(): AppError {
  return new AppError(429, 'OTP_LOCKED', 'Too many incorrect attempts. Request a new code.');
}

function otpResendCooldownError(): AppError {
  return new AppError(429, 'OTP_RESEND_COOLDOWN', 'Please wait before requesting another code.');
}

export function createOtpService(deps: OtpServiceDeps) {
  const { otpRepo, smsProvider, ttlSeconds, maxAttempts, resendCooldownSeconds } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * Always resolves the same way for a given phone number regardless of
     * whether it's been seen before — there's no "does this phone exist"
     * branch at all here (unlike forgotPassword, OTP doesn't need one:
     * anyone can request a code for any phone, since the code itself is
     * the only thing that grants anything). Resend cooldown IS enforced,
     * but the response shape doesn't reveal WHY a caller is being
     * rate-limited beyond the standard 429.
     */
    async requestOtp(companyId: string, phone: string, purpose: OtpPurpose): Promise<void> {
      const latest = await otpRepo.findLatestByPhone(companyId, phone, purpose);
      if (latest) {
        const elapsedSeconds = (now().getTime() - latest.createdAt.getTime()) / 1000;
        if (elapsedSeconds < resendCooldownSeconds) {
          throw otpResendCooldownError();
        }
      }

      const code = generateOtpCode();
      const expiresAt = new Date(now().getTime() + ttlSeconds * 1000);
      await otpRepo.create(companyId, {
        phone,
        purpose,
        codeHash: hashOpaqueToken(code),
        expiresAt,
        maxAttempts,
      });

      const minutes = Math.round(ttlSeconds / 60);
      await smsProvider.sendSms(
        phone,
        `Your BeautyBook verification code is ${code}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    },

    /**
     * Atomic claim-then-compare-then-mark-verified:
     *  1. `claimAttempt` atomically increments the attempt counter ONLY IF
     *     the record is still valid (not expired/verified/locked out) —
     *     this is what makes brute force and concurrent verification
     *     attempts safe under a race (dev-tasks.md §15).
     *  2. Only after successfully claiming an attempt do we compare the
     *     code — so a wrong guess always costs an attempt, atomically,
     *     even under concurrent requests.
     *  3. `markVerifiedIfUnverified` is itself atomic — makes the code
     *     single-use even if two requests somehow both had the correct
     *     code at the same instant.
     */
    async verifyOtp(
      companyId: string,
      phone: string,
      purpose: OtpPurpose,
      code: string,
    ): Promise<void> {
      const latest = await otpRepo.findLatestByPhone(companyId, phone, purpose);
      if (!latest) {
        throw new UnauthorizedError(GENERIC_VERIFY_ERROR);
      }

      const claimed = await otpRepo.claimAttempt(latest.id);
      if (!claimed) {
        const current = await otpRepo.findById(latest.id);
        if (current && current.attempts >= current.maxAttempts && !current.verifiedAt) {
          throw otpLockedError();
        }
        throw new UnauthorizedError(GENERIC_VERIFY_ERROR);
      }

      if (hashOpaqueToken(code) !== claimed.codeHash) {
        throw new UnauthorizedError(GENERIC_VERIFY_ERROR);
      }

      const verified = await otpRepo.markVerifiedIfUnverified(claimed.id);
      if (!verified) {
        throw new UnauthorizedError(GENERIC_VERIFY_ERROR);
      }
    },
  };
}

export type OtpService = ReturnType<typeof createOtpService>;
