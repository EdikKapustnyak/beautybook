import { Router } from 'express';

import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
} from '../controllers/employeeController.js';
import { requireFreshAuth } from '../middleware/requireFreshAuth.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const employeeRouter: Router = Router();

const canManageEmployees = requireTenantRole('owner', 'admin', 'manager');

employeeRouter.get('/', requireTenantAuth, listEmployees);
employeeRouter.get('/:id', requireTenantAuth, getEmployee);
employeeRouter.post('/', requireTenantAuth, canManageEmployees, createEmployee);
employeeRouter.patch('/:id', requireTenantAuth, canManageEmployees, updateEmployee);
// Destructive, high-cost mutation — step-up DB check
// (stale-role-window-fix_1.md mechanism 2), not just the Redis-cached
// tokenVersion check every other route relies on.
employeeRouter.delete(
  '/:id',
  requireTenantAuth,
  canManageEmployees,
  requireFreshAuth,
  deleteEmployee,
);
