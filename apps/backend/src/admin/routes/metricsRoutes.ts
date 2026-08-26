// apps/backend/src/admin/routes/metricsRoutes.ts

import { Router } from 'express';

import { getMrr } from '../controllers/metricsController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const metricsRouter: Router = Router();

// Read-only — both admin roles ('superadmin' and 'support') may view.
metricsRouter.get('/mrr', requireAdminAuth, getMrr);
