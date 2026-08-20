import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { verifyAccessToken } from '../../shared/security/tokens.js';
import { adminAuthConfig } from '../config.js';
import type { AdminUserRole } from '../models/adminUser.model.js';

interface AdminAccessTokenPayload extends Record<string, unknown> {
  sub: string;
  role: AdminUserRole;
}

/**
 * Verifies the platform-admin access token and attaches `req.adminAuth`.
 * Completely separate secret, completely separate payload shape from
 * `requireTenantAuth` — see beautybook-security-measures.md §2/§4.
 */
export function requireAdminAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAccessToken<AdminAccessTokenPayload>(
    token,
    adminAuthConfig.accessTokenSecret,
  );

  req.adminAuth = { adminUserId: payload.sub, role: payload.role };
  next();
}

export function requireAdminRole(...allowedRoles: AdminUserRole[]) {
  return function adminRoleGate(req: Request, _res: Response, next: NextFunction): void {
    if (!req.adminAuth || !allowedRoles.includes(req.adminAuth.role)) {
      throw new ForbiddenError('You do not have permission to do this.');
    }
    next();
  };
}
