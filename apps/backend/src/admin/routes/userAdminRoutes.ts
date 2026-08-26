// apps/backend/src/admin/routes/userAdminRoutes.ts

import { Router } from 'express';

import { listUsers } from '../controllers/userAdminController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const userAdminRouter: Router = Router();

userAdminRouter.get('/', requireAdminAuth, listUsers);
