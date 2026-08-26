// apps/backend/src/admin/routes/companyAdminRoutes.ts

import { Router } from 'express';

import {
  getCompany,
  listCompanies,
  updateCompanyStatus,
} from '../controllers/companyAdminController.js';
import { requireAdminAuth, requireAdminRole } from '../middleware/requireAdminAuth.js';

export const companyAdminRouter: Router = Router();

companyAdminRouter.get('/', requireAdminAuth, listCompanies);
companyAdminRouter.get('/:companyId', requireAdminAuth, getCompany);
// Suspending/reactivating a company is business-critical (it cuts off a
// paying customer's access) — 'superadmin' only, same bar as billing
// actions (planConfigRouter/adminSubscriptionRouter).
companyAdminRouter.patch(
  '/:companyId/status',
  requireAdminAuth,
  requireAdminRole('superadmin'),
  updateCompanyStatus,
);
