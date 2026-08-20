import { Router } from 'express';

import {
  createBlockedTime,
  deleteBlockedTime,
  listBlockedTime,
} from '../controllers/blockedTimeController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const blockedTimeRouter: Router = Router();

const canManageBlockedTime = requireTenantRole('owner', 'admin', 'manager');

blockedTimeRouter.get('/', requireTenantAuth, listBlockedTime);
blockedTimeRouter.post('/', requireTenantAuth, canManageBlockedTime, createBlockedTime);
blockedTimeRouter.delete('/:id', requireTenantAuth, canManageBlockedTime, deleteBlockedTime);
