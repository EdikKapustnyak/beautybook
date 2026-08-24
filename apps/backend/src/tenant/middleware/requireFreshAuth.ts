// apps/backend/src/tenant/middleware/requireFreshAuth.ts
//
// Step-up check for the narrow set of high-cost mutations
// (stale-role-window-fix_1.md mechanism 2). Deliberately bypasses the
// Redis-cached tokenVersion check entirely and reads role/status
// straight from MongoDB, every time, no exceptions. The Redis layer
// (requireTenantAuth) is a cheap defense that trusts "no revocation
// record" as "nothing changed" — appropriate for the entire API surface,
// but not for the handful of operations where the cost of Redis being
// stale/unavailable/lagging should fail CLOSED on trust rather than
// silently falling back to "allow".
//
// Exported as a factory (`createRequireFreshAuth`) taking a minimal
// user-lookup port as a parameter — same reasoning as
// requireTenantAuth.ts's createRequireTenantAuth: nothing else in this
// codebase unit-tests a concrete Mongoose repository directly (DB-facing
// logic is tested either as pure model validation with no connection, or
// at the service layer against in-memory fake ports — there is no
// existing pattern for hitting a live test database from a unit test),
// so this keeps requireFreshAuth consistent with that and testable with
// a fake instead of requiring Mongo in test.
//
// Must run AFTER requireTenantAuth (needs req.tenantAuth to already be
// populated) — usage:
//   router.delete('/:id', requireTenantAuth, requireTenantRole('owner'), requireFreshAuth, handler)

import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import type { TenantUserRole, TenantUserStatus } from '../models/user.model.js';
import { userRepository } from '../repositories/userRepository.js';

export interface FreshAuthUserLookup {
  findByIdInCompany(
    userId: string,
    companyId: string,
  ): Promise<{ role: TenantUserRole; status: TenantUserStatus } | null>;
}

/**
 * Re-fetches the user from MongoDB and rejects if status is no longer
 * active OR the live role no longer matches what the access token
 * claims. A role mismatch specifically (not just status) is treated as
 * a hard failure here — for these specific operations, "your token says
 * owner but the database now says manager" must never be silently
 * downgraded-and-allowed; the caller should re-authenticate and get a
 * fresh token reflecting their real, current role.
 */
export function createRequireFreshAuth(userLookup: FreshAuthUserLookup) {
  return async function requireFreshAuthHandler(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.tenantAuth) {
      throw new UnauthorizedError('Authentication is required.');
    }

    const user = await userLookup.findByIdInCompany(
      req.tenantAuth.userId,
      req.tenantAuth.companyId,
    );

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Your session is no longer valid. Please log in again.');
    }
    if (user.role !== req.tenantAuth.role) {
      throw new ForbiddenError('Your permissions have changed. Please log in again to continue.');
    }

    next();
  };
}

export const requireFreshAuth = asyncHandler(createRequireFreshAuth(userRepository));
