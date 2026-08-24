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

/**
 * Round 3 finding #4: the three public GET routes (company profile,
 * services, employees) had NO rate limiter at all, while their sibling
 * `/availability` did. resolveActivePublicCompany already gives an
 * identical generic 404 for nonexistent/draft/suspended slugs
 * (anti-enumeration by RESPONSE CONTENT works), but nothing bounded the
 * REQUEST RATE — an attacker could brute-force thousands of slugs/second
 * looking for active companies, or scrape a company's full public catalog
 * at unlimited concurrency. security-measures.md §15/§30 requires exactly
 * this kind of throttle. One shared limiter for all three: same risk
 * profile (read-only, no side effects), unlike OTP/booking routes below
 * which each have a distinct cost profile (SMS costs money, booking
 * writes to the DB) and so keep their own dedicated limiters.
 */
export const publicCompanyLookupLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: 'Too many requests, please try again shortly.',
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
