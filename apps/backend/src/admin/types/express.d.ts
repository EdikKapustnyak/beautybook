import type { AdminUserRole } from '../models/adminUser.model.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAdminAuth after verifying the admin access token. */
      adminAuth?: {
        adminUserId: string;
        role: AdminUserRole;
      };
    }
  }
}

export {};
