// apps/backend/src/admin/controllers/supportTicketController.ts

import { NotFoundError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { supportTicketRepository } from '../repositories/supportTicketRepository.js';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamSchema,
  updateTicketSchema,
} from '../validation/supportTicketSchemas.js';

export const listTickets = asyncHandler(async (req, res) => {
  const { page, limit, ...filter } = parseOrThrow(listTicketsQuerySchema, req.query);
  const { items, total } = await supportTicketRepository.list(filter, { page, limit });

  res.status(200).json({
    success: true,
    data: { tickets: items, pagination: { page, limit, total } },
  });
});

export const getTicket = asyncHandler(async (req, res) => {
  const { ticketId } = parseOrThrow(ticketIdParamSchema, req.params);
  const ticket = await supportTicketRepository.findById(ticketId);
  if (!ticket) {
    throw new NotFoundError('Support ticket not found.');
  }
  res.status(200).json({ success: true, data: { ticket } });
});

export const createTicket = asyncHandler(async (req, res) => {
  const input = parseOrThrow(createTicketSchema, req.body);
  const ticket = await supportTicketRepository.create(input);

  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'support_ticket.created',
    targetType: 'support_ticket',
    targetId: String(ticket._id),
  });

  res.status(201).json({ success: true, data: { ticket } });
});

export const updateTicket = asyncHandler(async (req, res) => {
  const { ticketId } = parseOrThrow(ticketIdParamSchema, req.params);
  const updates = parseOrThrow(updateTicketSchema, req.body);

  const ticket = await supportTicketRepository.update(ticketId, updates);
  if (!ticket) {
    throw new NotFoundError('Support ticket not found.');
  }

  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'support_ticket.updated',
    targetType: 'support_ticket',
    targetId: ticketId,
    metadata: updates,
  });

  res.status(200).json({ success: true, data: { ticket } });
});
