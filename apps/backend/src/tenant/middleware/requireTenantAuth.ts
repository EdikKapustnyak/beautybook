import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { verifyAccessToken } from '../../shared/security/tokens.js';
import { tenantAuthConfig } from '../config.js';
import type { TenantUserRole } from '../models/user.model.js';

interface TenantAccessTokenPayload extends Record<string, unknown> {
  sub: string;
  companyId: string;
  role: TenantUserRole;
}

/**
 * Verifies the tenant access token from the Authorization header and
 * attaches `req.tenantAuth`. This is the ONLY place `companyId` should
 * ever be considered trusted for the rest of the request — every
 * downstream tenant-scoped query must use `req.tenantAuth.companyId`,
 * never a value from `req.body`/`req.query`/`req.params`. See
 * beautybook-security-measures.md §4.
 */
export function requireTenantAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAccessToken<TenantAccessTokenPayload>(
    token,
    tenantAuthConfig.accessTokenSecret,
  );

  req.tenantAuth = {
    userId: payload.sub,
    companyId: payload.companyId,
    role: payload.role,
  };

  next();
}

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
