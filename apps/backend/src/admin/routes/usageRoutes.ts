// apps/backend/src/admin/routes/usageRoutes.ts

import { Router } from 'express';

import { getUsageOverview } from '../controllers/usageController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const usageRouter: Router = Router();

usageRouter.get('/', requireAdminAuth, getUsageOverview);
