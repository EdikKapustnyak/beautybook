import { Router } from 'express';

import { getCompany, updateCompany } from '../controllers/companyController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const companyRouter: Router = Router();

// Any authenticated tenant role may view the company profile.
companyRouter.get('/', requireTenantAuth, getCompany);

// Only owner/admin may change company settings — server-side RBAC, never
// trust frontend hiding. See beautybook-security-measures.md §5.
companyRouter.patch('/', requireTenantAuth, requireTenantRole('owner', 'admin'), updateCompany);
