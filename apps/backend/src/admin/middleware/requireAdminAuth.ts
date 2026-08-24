import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { verifyAccessToken } from '../../shared/security/tokens.js';
import {
  adminTokenVersionKey,
  type TokenVersionRevocationStore,
} from '../../shared/security/tokenVersionRevocation.js';
import { tokenVersionRevocationStore as realTokenVersionRevocationStore } from '../../shared/security/tokenVersionRevocation.instance.js';
import { adminAuthConfig } from '../config.js';
import type { AdminUserRole } from '../models/adminUser.model.js';

interface AdminAccessTokenPayload extends Record<string, unknown> {
  sub: string;
  role: AdminUserRole;
  /** Absent on pre-migration tokens — treated as 0, see requireTenantAuth.ts. */
  tokenVersion?: number;
}

/**
 * Verifies the platform-admin access token and attaches `req.adminAuth`.
 * Completely separate secret, completely separate payload shape from
 * `requireTenantAuth` — see beautybook-security-measures.md §2/§4.
 * Same tokenVersion revocation check as the tenant side — see
 * requireTenantAuth.ts's doc comment for the full rationale.
 */
/** Same raw-function-for-testability rationale as requireTenantAuth.ts's createRequireTenantAuth. */
export function createRequireAdminAuth(tokenVersionRevocationStore: TokenVersionRevocationStore) {
  return async function requireAdminAuthHandler(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication is required.');
    }

    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken<AdminAccessTokenPayload>(
      token,
      adminAuthConfig.accessTokenSecret,
    );

    const presentedVersion = payload.tokenVersion ?? 0;
    const revoked = await tokenVersionRevocationStore.isRevoked(
      adminTokenVersionKey(payload.sub),
      presentedVersion,
    );
    if (revoked) {
      throw new UnauthorizedError('Invalid or expired access token.');
    }

    req.adminAuth = { adminUserId: payload.sub, role: payload.role };
    next();
  };
}

export const requireAdminAuth = asyncHandler(
  createRequireAdminAuth(realTokenVersionRevocationStore),
);

export function requireAdminRole(...allowedRoles: AdminUserRole[]) {
  return function adminRoleGate(req: Request, _res: Response, next: NextFunction): void {
    if (!req.adminAuth || !allowedRoles.includes(req.adminAuth.role)) {
      throw new ForbiddenError('You do not have permission to do this.');
    }
    next();
  };
}
