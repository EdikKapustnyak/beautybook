// apps/backend/src/admin/routes/platformSettingsRoutes.ts

import { Router } from 'express';

import {
  getPlatformSettings,
  updatePlatformSettings,
} from '../controllers/platformSettingsController.js';
import { requireAdminAuth, requireAdminRole } from '../middleware/requireAdminAuth.js';

export const platformSettingsRouter: Router = Router();

platformSettingsRouter.get('/', requireAdminAuth, getPlatformSettings);
platformSettingsRouter.patch(
  '/',
  requireAdminAuth,
  requireAdminRole('superadmin'),
  updatePlatformSettings,
);
