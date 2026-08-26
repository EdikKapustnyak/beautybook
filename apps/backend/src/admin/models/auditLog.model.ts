// apps/backend/src/admin/models/auditLog.model.ts
//
// dev-tasks.md §22 ("Audit logs") / §27's "platform admin actions" as one
// of the listed critical audit events. Scope of THIS model, stated
// explicitly: platform-admin-initiated actions only (plan/pricing
// changes, manual subscription grants, company suspension, discount
// code changes, platform settings changes). Tenant-side critical events
// (login, password reset, role change, booking cancellation, etc. — the
// REST of dev-tasks.md §27's list) are a separate, larger piece of work
// spanning the tenant surface and are NOT written here — this collection
// has exactly one writer, admin/repositories/auditLogRepository.ts,
// called only from admin/controllers/*.
//
// Lives entirely under admin/ (not shared/billing/-style) because,
// unlike Subscription/PlanConfig, nothing on the tenant side ever needs
// to read or write it — no eslint boundary concern here.

import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface AuditLogAttrs {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLogAttrs>;

const auditLogSchema = new Schema<AuditLogAttrs>({
  adminUserId: { type: String, required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

auditLogSchema.index({ createdAt: -1 });

export const AuditLogModel: Model<AuditLogAttrs> = model<AuditLogAttrs>('AuditLog', auditLogSchema);
