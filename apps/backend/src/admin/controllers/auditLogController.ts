// apps/backend/src/admin/controllers/auditLogController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { listAuditLogsQuerySchema } from '../validation/auditLogSchemas.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, ...filter } = parseOrThrow(listAuditLogsQuerySchema, req.query);
  const { items, total } = await auditLogRepository.list(filter, { page, limit });

  res.status(200).json({
    success: true,
    data: { auditLogs: items, pagination: { page, limit, total } },
  });
});
