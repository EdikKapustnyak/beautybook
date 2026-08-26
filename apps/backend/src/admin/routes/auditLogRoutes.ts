// apps/backend/src/admin/routes/auditLogRoutes.ts

import { Router } from 'express';

import { listAuditLogs } from '../controllers/auditLogController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const auditLogRouter: Router = Router();

// Read-only — both admin roles may view (matches metricsRouter's bar;
// only WRITES to sensitive resources are 'superadmin'-only).
auditLogRouter.get('/', requireAdminAuth, listAuditLogs);
