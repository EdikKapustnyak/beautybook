// apps/backend/src/admin/validation/supportTicketSchemas.ts

import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';

export const ticketIdParamSchema = z.object({
  ticketId: z.string().refine(isValidObjectId, 'Must be a valid id.'),
});

export const listTicketsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

export const createTicketSchema = z
  .object({
    companyId: z.string().refine(isValidObjectId, 'Must be a valid id.').optional(),
    subject: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    requesterEmail: z.string().trim().email().optional(),
    requesterName: z.string().trim().max(200).optional(),
  })
  .strict();

export const updateTicketSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignedAdminUserId: z.string().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
