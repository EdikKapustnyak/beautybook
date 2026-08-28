// apps/backend/src/admin/routes/systemStatusRoutes.ts

import { Router } from 'express';

import { getSystemStatus } from '../controllers/systemStatusController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const systemStatusRouter: Router = Router();

systemStatusRouter.get('/', requireAdminAuth, getSystemStatus);
