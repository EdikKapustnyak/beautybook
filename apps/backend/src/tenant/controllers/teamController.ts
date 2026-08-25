// apps/backend/src/tenant/controllers/teamController.ts
//
// Team-management endpoint — closes HANDOFF_2.md §4 item 2:
// authService.updateUserRoleOrStatus (and the admin-surface equivalent,
// adminAuthService.updateAdminRoleOrStatus, which stays deliberately
// unwired — see the "not in scope" note at the bottom of this header)
// were built ahead of any HTTP caller. This is the first one.
//
// Scope decision, stated explicitly: this endpoint only changes role/
// status on an EXISTING TenantUser. There is still no HTTP-reachable way
// to CREATE a second team member (userRepository.createInCompany is only
// ever called internally by authService.registerCompanyAndOwner) — an
// invite/onboarding flow (email invite, password setup) is a materially
// bigger feature than "wire the already-built update path to HTTP" and
// is left for its own stage. Team members today only get into a company
// via registerCompanyAndOwner (the owner) — until an invite flow exists,
// this endpoint's practical use is limited to a single-owner company
// managing their own status, which the self-modification guard below
// deliberately blocks. That is a known, narrow gap, not a bug.

import { isValidObjectId } from 'mongoose';

import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { userRepository } from '../repositories/userRepository.js';
import { authService } from '../services/authService.instance.js';
import {
  listTeamMembersQuerySchema,
  updateTeamMemberRoleOrStatusSchema,
} from '../validation/teamSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string; role: string } | undefined): {
  userId: string;
  companyId: string;
  role: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

export const listTeamMembers = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(listTeamMembersQuerySchema, req.query);

  const { items, total } = await userRepository.listInCompany(companyId, query);
  res.status(200).json({
    success: true,
    data: { users: items, pagination: { page: query.page, limit: query.limit, total } },
  });
});

export const updateTeamMemberRoleOrStatus = asyncHandler(async (req, res) => {
  const { userId: callerId, companyId, role: callerRole } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');
  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid team member id.');
  }
  const updates = parseOrThrow(updateTeamMemberRoleOrStatusSchema, req.body);

  // Never allow a caller to change their own role/status through this
  // endpoint — security-measures.md §28 ("stale role after revocation",
  // "modified JWT role") is about a token no longer matching reality;
  // self-service role/status changes are a DIFFERENT risk (accidental
  // company lockout if the last owner disables themselves, or a simple
  // privilege-escalation shortcut) that a generic "any owner/admin can
  // edit any teammate" endpoint should not also open up. Account status
  // changes to one's own account, if ever needed, belong in a dedicated,
  // more deliberate flow (e.g. "delete my account"), not this one.
  if (id === callerId) {
    throw new ForbiddenError('You cannot change your own role or status here.');
  }

  const target = await userRepository.findByIdInCompany(id, companyId);
  if (!target) {
    throw new NotFoundError('Team member not found.');
  }

  // Owner protection (security-measures.md §5's example: "Employee не
  // может ... изменить owner" — generalized to "only an owner may touch
  // an owner account or grant the owner role"). An admin can manage
  // managers/employees/other admins, but never an owner account, and can
  // never promote anyone TO owner.
  const touchesOwner = target.role === 'owner' || updates.role === 'owner';
  if (touchesOwner && callerRole !== 'owner') {
    throw new ForbiddenError('Only an owner can grant or modify the owner role.');
  }

  const updated = await authService.updateUserRoleOrStatus({
    userId: id,
    companyId,
    updates,
  });
  if (!updated) {
    // Target existed on the read above but is gone now (deleted/moved
    // concurrently) — treat as not-found rather than a 500.
    throw new NotFoundError('Team member not found.');
  }

  res.status(200).json({ success: true, data: { user: updated } });
});
