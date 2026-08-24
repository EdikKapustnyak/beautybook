import { Router } from 'express';

import { getCompany, updateCompany } from '../controllers/companyController.js';
import { requireFreshAuth } from '../middleware/requireFreshAuth.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const companyRouter: Router = Router();

// Any authenticated tenant role may view the company profile.
companyRouter.get('/', requireTenantAuth, getCompany);

// Only owner/admin may change company settings — server-side RBAC, never
// trust frontend hiding. See beautybook-security-measures.md §5. Step-up
// DB check added (stale-role-window-fix_1.md mechanism 2): company
// settings are cheap to attack and expensive to get wrong, so this route
// doesn't rely on the Redis-cached tokenVersion check alone.
companyRouter.patch(
  '/',
  requireTenantAuth,
  requireTenantRole('owner', 'admin'),
  requireFreshAuth,
  updateCompany,
);
