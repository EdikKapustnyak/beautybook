// apps/backend/src/admin/routes/subscriptionsOverviewRoutes.ts

import { Router } from 'express';

import { getSubscriptionsOverview } from '../controllers/subscriptionsOverviewController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const subscriptionsOverviewRouter: Router = Router();

subscriptionsOverviewRouter.get('/', requireAdminAuth, getSubscriptionsOverview);
