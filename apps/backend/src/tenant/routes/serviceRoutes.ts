import { Router } from 'express';

import {
  createService,
  deleteService,
  getService,
  listServices,
  updateService,
} from '../controllers/serviceController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const serviceRouter: Router = Router();

const canManageServices = requireTenantRole('owner', 'admin', 'manager');

serviceRouter.get('/', requireTenantAuth, listServices);
serviceRouter.get('/:id', requireTenantAuth, getService);
serviceRouter.post('/', requireTenantAuth, canManageServices, createService);
serviceRouter.patch('/:id', requireTenantAuth, canManageServices, updateService);
serviceRouter.delete('/:id', requireTenantAuth, canManageServices, deleteService);
