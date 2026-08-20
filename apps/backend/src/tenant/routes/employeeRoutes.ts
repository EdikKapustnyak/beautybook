import { Router } from 'express';

import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
} from '../controllers/employeeController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const employeeRouter: Router = Router();

const canManageEmployees = requireTenantRole('owner', 'admin', 'manager');

employeeRouter.get('/', requireTenantAuth, listEmployees);
employeeRouter.get('/:id', requireTenantAuth, getEmployee);
employeeRouter.post('/', requireTenantAuth, canManageEmployees, createEmployee);
employeeRouter.patch('/:id', requireTenantAuth, canManageEmployees, updateEmployee);
employeeRouter.delete('/:id', requireTenantAuth, canManageEmployees, deleteEmployee);
