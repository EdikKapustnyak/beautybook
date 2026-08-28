// apps/backend/src/admin/routes/supportTicketRoutes.ts

import { Router } from 'express';

import {
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
} from '../controllers/supportTicketController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const supportTicketRouter: Router = Router();

// Both admin roles ('superadmin' and 'support') may read/write tickets —
// unlike billing actions, ticket triage is exactly what the 'support'
// role exists for.
supportTicketRouter.get('/', requireAdminAuth, listTickets);
supportTicketRouter.post('/', requireAdminAuth, createTicket);
supportTicketRouter.get('/:ticketId', requireAdminAuth, getTicket);
supportTicketRouter.patch('/:ticketId', requireAdminAuth, updateTicket);
