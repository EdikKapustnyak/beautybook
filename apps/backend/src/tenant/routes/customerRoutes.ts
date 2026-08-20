import { Router } from 'express';

import {
  anonymizeCustomer,
  createCustomer,
  getCustomer,
  getCustomerBookings,
  listCustomers,
  updateCustomer,
} from '../controllers/customerController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const customerRouter: Router = Router();

const canManageCustomers = requireTenantRole('owner', 'admin', 'manager');
// Anonymization is a more sensitive, harder-to-undo operation than
// ordinary CRUD — restricted to owner/admin only, deliberately excluding
// manager (a tighter RBAC than the pattern used elsewhere).
const canAnonymizeCustomers = requireTenantRole('owner', 'admin');

customerRouter.get('/', requireTenantAuth, listCustomers);
customerRouter.get('/:id', requireTenantAuth, getCustomer);
customerRouter.get('/:id/bookings', requireTenantAuth, getCustomerBookings);
customerRouter.post('/', requireTenantAuth, canManageCustomers, createCustomer);
customerRouter.patch('/:id', requireTenantAuth, canManageCustomers, updateCustomer);
customerRouter.delete('/:id', requireTenantAuth, canAnonymizeCustomers, anonymizeCustomer);
