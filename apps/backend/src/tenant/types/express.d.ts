import type { TenantUserRole } from '../models/user.model.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireTenantAuth after verifying the tenant access token. */
      tenantAuth?: {
        userId: string;
        companyId: string;
        role: TenantUserRole;
      };
    }
  }
}

export {};
