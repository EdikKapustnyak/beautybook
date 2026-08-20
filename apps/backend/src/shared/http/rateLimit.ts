import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Per-IP rate limiter. This is the MVP layer only — per-account/per-phone
 * limiting (security-measures.md §3, "не полагаться только на IP rate
 * limit") is added alongside OTP/SMS in a later stage. Uses the in-memory
 * store, which is fine for a single backend instance; swap to a
 * Redis-backed store once BullMQ/Redis wiring lands (Stage 16/23).
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: options.message },
    },
  });
}
