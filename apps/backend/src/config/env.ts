import 'dotenv/config';
import { z } from 'zod';

/**
 * All runtime configuration must flow through this schema.
 * Never read `process.env` directly anywhere else in the codebase —
 * this is the single source of truth and the single validation point.
 *
 * Values here are placeholders/shape definitions only. Real secrets
 * belong in an untracked `.env` file locally, and in the deployment
 * platform's secret manager for staging/production. See `.env.example`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Database / cache
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Tenant auth — must be distinct from platform-admin auth secrets.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  PUBLIC_BOOKING_TOKEN_SECRET: z.string().min(32, 'PUBLIC_BOOKING_TOKEN_SECRET must be at least 32 characters'),

  // Platform admin auth — separate secrets/session store from tenant auth.
  ADMIN_JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'ADMIN_JWT_ACCESS_SECRET must be at least 32 characters'),
  ADMIN_JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'ADMIN_JWT_REFRESH_SECRET must be at least 32 characters'),

  // Token lifetimes (seconds). Access tokens are short-lived and kept in
  // memory on the frontend; refresh tokens are long-lived and live only in
  // an httpOnly cookie, backed by a server-side Session record so they can
  // be individually revoked. See beautybook-security-measures.md §2.
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60),
  ADMIN_JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  ADMIN_JWT_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),

  // Password reset tokens are short-lived and single-use.
  PASSWORD_RESET_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60),

  // Billing
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),

  // SMS provider — 'console' (default, logs to stdout in development only,
  // for local dev/testing without a real Twilio account) or 'twilio'
  // (real provider — technical-spec.md §11, security-measures.md §13).
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // OTP (phone verification) — security-measures.md §14.
  OTP_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

  // Object storage — S3-compatible (works with AWS S3 or MinIO/DigitalOcean
  // Spaces/Cloudflare R2/etc. via S3_ENDPOINT + S3_FORCE_PATH_STYLE). See
  // technical-spec.md §16 and beautybook-security-measures.md §10/§11.
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  // Only needed for non-AWS S3-compatible providers (e.g. MinIO). Leave
  // unset to use AWS S3 directly.
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
  // Base URL PUBLIC objects (portfolio images only) are served from —
  // e.g. a CDN domain or the bucket's public endpoint. Never used for
  // booking attachments, which are always private. No trailing slash.
  S3_PUBLIC_BASE_URL: z.string().url(),

  // Max upload sizes (bytes). Kept as env-tunable rather than hardcoded
  // since acceptable limits vary by deployment/storage cost tolerance.
  PORTFOLIO_IMAGE_MAX_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024), // 5MB
  BOOKING_ATTACHMENT_MAX_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 1024 * 1024), // 8MB
  // How long a temporary booking attachment is kept before the cleanup
  // job deletes it — technical-spec.md §10/§16, security-measures.md §12.
  BOOKING_ATTACHMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // CORS allowlist for the PUBLIC/tenant surface (landing pages, tenant
  // dashboard). Comma-separated, never a wildcard in production.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // CORS allowlist for the PLATFORM ADMIN surface only. Deliberately
  // separate from CORS_ALLOWED_ORIGINS — the public frontend's origin must
  // never be implicitly trusted by admin endpoints, and vice versa.
  ADMIN_CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3100')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error('❌ Invalid environment variables:', fieldErrors);
    throw new Error(
      'Invalid or missing environment variables. Copy .env.example to .env and fill in real values.',
    );
  }

  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.CORS_ALLOWED_ORIGINS.includes('*')) {
      throw new Error('CORS_ALLOWED_ORIGINS must not be a wildcard in production.');
    }
    if (parsed.data.ADMIN_CORS_ALLOWED_ORIGINS.includes('*')) {
      throw new Error('ADMIN_CORS_ALLOWED_ORIGINS must not be a wildcard in production.');
    }
    if (parsed.data.JWT_ACCESS_SECRET === parsed.data.ADMIN_JWT_ACCESS_SECRET) {
      throw new Error('Tenant and admin JWT secrets must not be identical.');
    }
    if (parsed.data.JWT_REFRESH_SECRET === parsed.data.ADMIN_JWT_REFRESH_SECRET) {
      throw new Error('Tenant and admin refresh JWT secrets must not be identical.');
    }
  }

  if (
    parsed.data.SMS_PROVIDER === 'twilio' &&
    (!parsed.data.TWILIO_ACCOUNT_SID ||
      !parsed.data.TWILIO_AUTH_TOKEN ||
      !parsed.data.TWILIO_FROM_NUMBER)
  ) {
    throw new Error(
      'SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.',
    );
  }

  return parsed.data;
}

export const env = loadEnv();
