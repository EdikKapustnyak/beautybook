import { env } from '../config/env.js';

/**
 * Tenant-surface configuration. Deliberately picks only the tenant-scoped
 * fields off `env` — this file must never import `ADMIN_*` values, and
 * `src/admin/**` must never import from this file. Both are enforced by
 * the `no-restricted-imports` boundary rule in the root ESLint config.
 */
export const tenantAuthConfig = {
  accessTokenSecret: env.JWT_ACCESS_SECRET,
  refreshTokenSecret: env.JWT_REFRESH_SECRET,
  accessTokenTtlSeconds: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlSeconds: env.JWT_REFRESH_TOKEN_TTL_SECONDS,
  passwordResetTokenTtlSeconds: env.PASSWORD_RESET_TOKEN_TTL_SECONDS,
  // Distinct cookie name so a tenant session cookie can never be mistaken
  // for (or reused as) an admin session cookie, even by accident.
  refreshCookieName: 'bb_tenant_refresh',
} as const;

export const tenantCorsConfig = {
  allowedOrigins: env.CORS_ALLOWED_ORIGINS,
} as const;
