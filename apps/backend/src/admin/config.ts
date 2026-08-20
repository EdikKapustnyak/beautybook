import { env } from '../config/env.js';

/**
 * Platform-admin-surface configuration. Deliberately picks only the
 * admin-scoped fields off `env` — this file must never import the tenant
 * `JWT_*`/`CORS_ALLOWED_ORIGINS` values, and `src/tenant/**` must never
 * import from this file. Both are enforced by the `no-restricted-imports`
 * boundary rule in the root ESLint config.
 */
export const adminAuthConfig = {
  accessTokenSecret: env.ADMIN_JWT_ACCESS_SECRET,
  refreshTokenSecret: env.ADMIN_JWT_REFRESH_SECRET,
  accessTokenTtlSeconds: env.ADMIN_JWT_ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlSeconds: env.ADMIN_JWT_REFRESH_TOKEN_TTL_SECONDS,
  // Distinct cookie name so an admin session cookie can never be mistaken
  // for (or reused as) a tenant session cookie, even by accident.
  refreshCookieName: 'bb_admin_refresh',
} as const;

export const adminCorsConfig = {
  allowedOrigins: env.ADMIN_CORS_ALLOWED_ORIGINS,
} as const;
