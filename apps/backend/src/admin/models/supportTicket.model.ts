// apps/backend/src/admin/models/supportTicket.model.ts
//
// dev-tasks.md §22's design-mockup "Support" section (Subject/Priority/
// Status columns). Scope decision, stated explicitly: this is the
// ADMIN-side view/management of tickets only — there is no tenant-facing
// "submit a support ticket" endpoint yet (a company owner filing a
// ticket would currently go through email/phone, and an admin transcribes
// it here, or a future session adds a tenant-facing creation endpoint).
// `companyId` is therefore optional (a ticket may arrive before it's
// linked to an identifiable company) and lives under admin/, not
// shared/billing/ or similar — nothing on the tenant side needs to read
// or write this collection today.

import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const SUPPORT_TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export interface SupportTicketAttrs {
  companyId?: string;
  subject: string;
  description: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  requesterEmail?: string;
  requesterName?: string;
  assignedAdminUserId?: string;
}

export type SupportTicketDocument = HydratedDocument<SupportTicketAttrs>;

const supportTicketSchema = new Schema<SupportTicketAttrs>(
  {
    companyId: { type: String },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    priority: {
      type: String,
      enum: SUPPORT_TICKET_PRIORITIES,
      required: true,
      default: 'medium',
    },
    status: { type: String, enum: SUPPORT_TICKET_STATUSES, required: true, default: 'open' },
    requesterEmail: { type: String, trim: true, lowercase: true },
    requesterName: { type: String, trim: true, maxlength: 200 },
    assignedAdminUserId: { type: String },
  },
  { timestamps: true },
);

supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ companyId: 1 });

export const SupportTicketModel: Model<SupportTicketAttrs> = model<SupportTicketAttrs>(
  'SupportTicket',
  supportTicketSchema,
);
