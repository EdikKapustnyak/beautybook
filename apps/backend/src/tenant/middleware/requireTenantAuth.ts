import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { verifyAccessToken } from '../../shared/security/tokens.js';
import {
  tenantTokenVersionKey,
  type TokenVersionRevocationStore,
} from '../../shared/security/tokenVersionRevocation.js';
import { tokenVersionRevocationStore as realTokenVersionRevocationStore } from '../../shared/security/tokenVersionRevocation.instance.js';
import { tenantAuthConfig } from '../config.js';
import type { TenantUserRole } from '../models/user.model.js';

interface TenantAccessTokenPayload extends Record<string, unknown> {
  sub: string;
  companyId: string;
  role: TenantUserRole;
  /**
   * Absent on tokens issued before this field existed — treated as 0
   * below, matching the model's own default, so deploying this change
   * does not mass-invalidate every currently-active session.
   */
  tokenVersion?: number;
}

/**
 * Verifies the tenant access token from the Authorization header, checks
 * it against the tokenVersion revocation record (see
 * shared/security/tokenVersionRevocation.ts and
 * stale-role-window-fix_1.md mechanism 1), and attaches `req.tenantAuth`.
 * This is the ONLY place `companyId` should ever be considered trusted
 * for the rest of the request — every downstream tenant-scoped query
 * must use `req.tenantAuth.companyId`, never a value from
 * `req.body`/`req.query`/`req.params`. See beautybook-security-measures.md
 * §4.
 *
 * Exported as a factory (`createRequireTenantAuth`) taking the
 * revocation store as a parameter, with `requireTenantAuth` below being
 * the real, pre-wired instance every route actually imports — same
 * injectable-dependency style as the rest of this codebase, so tests can
 * pass a fake store instead of hitting real Redis.
 */
/**
 * Returns the RAW async middleware function — deliberately NOT wrapped in
 * asyncHandler here. asyncHandler's wrapper has signature
 * `(req,res,next) => void` (fire-and-forget: it calls `handler(...).catch(next)`
 * without returning that promise), which is exactly right for real Express
 * routing but makes direct unit testing impossible to `await` correctly —
 * `await requireTenantAuth(req,res,next)` would resolve on the NEXT
 * microtask, before the inner Redis check actually finishes. Tests import
 * this factory directly and get a real, awaitable promise; the
 * asyncHandler-wrapped, route-ready version is `requireTenantAuth` below.
 */
export function createRequireTenantAuth(tokenVersionRevocationStore: TokenVersionRevocationStore) {
  return async function requireTenantAuthHandler(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication is required.');
    }

    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken<TenantAccessTokenPayload>(
      token,
      tenantAuthConfig.accessTokenSecret,
    );

    const presentedVersion = payload.tokenVersion ?? 0;
    const revoked = await tokenVersionRevocationStore.isRevoked(
      tenantTokenVersionKey(payload.sub),
      presentedVersion,
    );
    if (revoked) {
      // Deliberately the SAME generic message as any other invalid
      // token — never reveal to the caller that this token was
      // specifically rejected for being stale vs. malformed/expired.
      throw new UnauthorizedError('Invalid or expired access token.');
    }

    req.tenantAuth = {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
    };

    next();
  };
}

export const requireTenantAuth = asyncHandler(
  createRequireTenantAuth(realTokenVersionRevocationStore),
);

/**
 * Role-gate factory — server-side RBAC, never trust frontend hiding.
 * Usage: `router.delete('/x', requireTenantAuth, requireTenantRole('owner', 'admin'), handler)`.
 */
export function requireTenantRole(...allowedRoles: TenantUserRole[]) {
  return function tenantRoleGate(req: Request, _res: Response, next: NextFunction): void {
    if (!req.tenantAuth) {
      throw new UnauthorizedError('Authentication is required.');
    }
    if (!allowedRoles.includes(req.tenantAuth.role)) {
      throw new ForbiddenError('You do not have permission to do this.');
    }
    next();
  };
}
