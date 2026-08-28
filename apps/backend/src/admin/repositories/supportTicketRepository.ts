// apps/backend/src/admin/repositories/supportTicketRepository.ts

import {
  SupportTicketModel,
  type SupportTicketAttrs,
  type SupportTicketDocument,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '../models/supportTicket.model.js';

export type CreateSupportTicketInput = Pick<SupportTicketAttrs, 'subject' | 'description'> &
  Partial<Pick<SupportTicketAttrs, 'companyId' | 'priority' | 'requesterEmail' | 'requesterName'>>;

export type UpdateSupportTicketInput = Partial<
  Pick<SupportTicketAttrs, 'status' | 'priority' | 'assignedAdminUserId'>
>;

export interface ListSupportTicketsFilter {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
}

export const supportTicketRepository = {
  async create(data: CreateSupportTicketInput): Promise<SupportTicketDocument> {
    return SupportTicketModel.create(data);
  },

  async findById(ticketId: string): Promise<SupportTicketDocument | null> {
    return SupportTicketModel.findById(ticketId).exec();
  },

  async list(
    filter: ListSupportTicketsFilter,
    options: { page: number; limit: number },
  ): Promise<{ items: SupportTicketDocument[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.priority) query.priority = filter.priority;

    const skip = (options.page - 1) * options.limit;
    const [items, total] = await Promise.all([
      SupportTicketModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(options.limit).exec(),
      SupportTicketModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  },

  async update(
    ticketId: string,
    updates: UpdateSupportTicketInput,
  ): Promise<SupportTicketDocument | null> {
    return SupportTicketModel.findByIdAndUpdate(ticketId, { $set: updates }, { new: true }).exec();
  },
};
