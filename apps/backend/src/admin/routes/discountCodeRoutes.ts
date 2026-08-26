// apps/backend/src/admin/routes/discountCodeRoutes.ts

import { Router } from 'express';

import {
  createDiscountCode,
  listDiscountCodes,
  setDiscountCodeActive,
} from '../controllers/discountCodeController.js';
import { requireAdminAuth, requireAdminRole } from '../middleware/requireAdminAuth.js';

export const discountCodeRouter: Router = Router();

discountCodeRouter.get('/', requireAdminAuth, listDiscountCodes);
// Creating/toggling a discount code is billing-sensitive (real revenue
// impact) — 'superadmin' only, same bar as plan pricing/subscription grants.
discountCodeRouter.post('/', requireAdminAuth, requireAdminRole('superadmin'), createDiscountCode);
discountCodeRouter.patch(
  '/:code/active',
  requireAdminAuth,
  requireAdminRole('superadmin'),
  setDiscountCodeActive,
);
