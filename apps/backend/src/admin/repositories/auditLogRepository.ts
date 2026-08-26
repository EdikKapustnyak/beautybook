// apps/backend/src/admin/repositories/auditLogRepository.ts

import {
  AuditLogModel,
  type AuditLogAttrs,
  type AuditLogDocument,
} from '../models/auditLog.model.js';

export interface AuditLogFilter {
  adminUserId?: string;
  action?: string;
  targetType?: string;
}

export const auditLogRepository = {
  async record(entry: Omit<AuditLogAttrs, 'createdAt'>): Promise<AuditLogDocument> {
    return AuditLogModel.create({ ...entry, createdAt: new Date() });
  },

  async list(
    filter: AuditLogFilter,
    options: { page: number; limit: number },
  ): Promise<{ items: AuditLogDocument[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.adminUserId) query.adminUserId = filter.adminUserId;
    if (filter.action) query.action = filter.action;
    if (filter.targetType) query.targetType = filter.targetType;

    const skip = (options.page - 1) * options.limit;
    const [items, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(options.limit).exec(),
      AuditLogModel.countDocuments(query).exec(),
    ]);

    return { items, total };
  },
};
