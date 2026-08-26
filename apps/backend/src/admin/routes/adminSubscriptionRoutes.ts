// apps/backend/src/admin/routes/adminSubscriptionRoutes.ts
//
// Mounted at /api/admin/companies/:companyId/subscription — see
// adminSubscriptionController.ts. `{ mergeParams: true }` is required so
// this sub-router can read `:companyId` from the parent mount path (see
// admin/router.ts).

import { Router } from 'express';

import {
  getCompanySubscription,
  grantSubscriptionHandler,
} from '../controllers/adminSubscriptionController.js';
import { requireAdminAuth, requireAdminRole } from '../middleware/requireAdminAuth.js';

export const adminSubscriptionRouter: Router = Router({ mergeParams: true });

adminSubscriptionRouter.get('/', requireAdminAuth, getCompanySubscription);
// Granting a subscription for free is a billing-sensitive, potentially
// revenue-affecting action — 'superadmin' only, same bar as plan pricing.
adminSubscriptionRouter.post(
  '/grant',
  requireAdminAuth,
  requireAdminRole('superadmin'),
  grantSubscriptionHandler,
);
