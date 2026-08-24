// apps/backend/src/tenant/middleware/publicRateLimiters.ts
//
// Rate limiters for the public, unauthenticated surface
// (dev-tasks.md §23, security-measures.md §15 "Booking Abuse").
//
// Built on the existing createRateLimiter({ windowMs, max, message })
// factory from shared/http/rateLimit.ts — signature confirmed in
// HANDOFF_1.md §5 ("in-memory store, comment suggests Redis-backed later —
// Redis is live now via Stage 15-17, not urgent to switch").
//
// These are per-IP only. Per-phone limiting for OTP (resend cooldown, max
// attempts) already lives inside otpService itself — this layer only adds
// the IP dimension on top, per security-measures.md §3 ("Нужны два слоя").

import { createRateLimiter } from '../../shared/http/rateLimit.js';

export const publicAvailabilityLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: 'Too many availability requests, please try again shortly.',
});

export const publicOtpRequestLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: 'Too many verification code requests, please try again shortly.',
});

export const publicOtpVerifyLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: 'Too many verification attempts, please try again shortly.',
});

export const publicBookingLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: 'Too many booking requests, please try again shortly.',
});

export const publicBookingManagementLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: 'Too many requests, please try again shortly.',
});
