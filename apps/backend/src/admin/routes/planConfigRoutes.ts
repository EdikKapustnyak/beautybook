// apps/backend/src/admin/routes/planConfigRoutes.ts

import { Router } from 'express';

import { listPlanConfigs, updatePlanConfig } from '../controllers/planConfigController.js';
import { requireAdminAuth, requireAdminRole } from '../middleware/requireAdminAuth.js';

export const planConfigRouter: Router = Router();

// Both admin roles may view pricing — only 'superadmin' may change it
// (billing-sensitive, same bar as the subscription-grant route).
planConfigRouter.get('/', requireAdminAuth, listPlanConfigs);
planConfigRouter.patch(
  '/:plan',
  requireAdminAuth,
  requireAdminRole('superadmin'),
  updatePlanConfig,
);
