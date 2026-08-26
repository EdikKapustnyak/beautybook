// apps/backend/src/admin/validation/auditLogSchemas.ts

import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  adminUserId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
});
