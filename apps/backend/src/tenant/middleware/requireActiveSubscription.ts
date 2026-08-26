// apps/backend/src/tenant/middleware/requireActiveSubscription.ts
//
// dev-tasks.md §21's "Feature gates" checklist item — a reusable
// building block, deliberately NOT wired into any existing route by
// this file. Which mutating actions should actually require an active
// subscription (creating a booking? adding an employee? none of them,
// for a generous free tier?) and what grace-period policy applies
// (`past_due` still counts as entitled for N days?) are product
// decisions this codebase hasn't made yet — retrofitting this onto
// existing, already-tested routes without that decision risks silently
// changing behavior for routes with no test coverage for "company has no
// subscription yet". A future session wires this into specific routes
// once that's decided; this file makes doing so a one-line addition.

import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { mongoSubscriptionRepositoryPort } from '../../shared/billing/adapters.js';
import type { SubscriptionRepositoryPort } from '../../shared/billing/types.js';

/** Statuses that count as "the company may use gated features" — everything else blocks. */
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

/** Same raw-function-for-testability rationale as requireTenantAuth.ts's createRequireTenantAuth. */
export function createRequireActiveSubscription(subscriptionRepo: SubscriptionRepositoryPort) {
  return async function requireActiveSubscriptionHandler(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.tenantAuth) {
      throw new UnauthorizedError('Authentication is required.');
    }

    const subscription = await subscriptionRepo.findByCompanyId(req.tenantAuth.companyId);
    if (!subscription || !ENTITLED_STATUSES.has(subscription.status)) {
      throw new ForbiddenError(
        'This feature requires an active subscription. Please update your billing to continue.',
      );
    }

    next();
  };
}

/** Ready to use as-is — e.g. `someRouter.post('/', requireTenantAuth, requireActiveSubscription, controllerFn)`. */
export const requireActiveSubscription = asyncHandler(
  createRequireActiveSubscription(mongoSubscriptionRepositoryPort),
);
