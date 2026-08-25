// apps/backend/src/tenant/routes/teamRoutes.ts
//
// Team-management endpoint — see teamController.ts header for full scope
// notes. Mounted as its own `/team` surface (not folded into
// employeeRoutes.ts) because Employee (roster: calendar/bookings) and
// TenantUser (login account: role/status) are deliberately separate
// models — see README.md's "Employee vs. TenantUser" note from Stage 5/7.

import { Router } from 'express';

import { listTeamMembers, updateTeamMemberRoleOrStatus } from '../controllers/teamController.js';
import { requireFreshAuth } from '../middleware/requireFreshAuth.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const teamRouter: Router = Router();

// Any authenticated tenant role may view the team roster — matches the
// read-is-open-to-everyone pattern used for Employees/Services/
// BlockedTime (README.md Stage 5/7).
teamRouter.get('/', requireTenantAuth, listTeamMembers);

// Only owner/admin may change a teammate's role/status — server-side
// RBAC, never trust frontend hiding (security-measures.md §5). Step-up
// DB check (stale-role-window-fix_1.md mechanism 2), matching the same
// high-stakes-mutation pattern as PATCH /company and DELETE /employees/:id:
// this route changes OTHER people's access, so it should not rely on the
// Redis-cached tokenVersion check alone.
teamRouter.patch(
  '/:id',
  requireTenantAuth,
  requireTenantRole('owner', 'admin'),
  requireFreshAuth,
  updateTeamMemberRoleOrStatus,
);
