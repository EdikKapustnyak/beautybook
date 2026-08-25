// apps/backend/src/tenant/validation/teamSchemas.ts
//
// Zod schemas for the team-management endpoint (tenant/controllers/
// teamController.ts) — closing HANDOFF_2.md §4 item 2: authService.
// updateUserRoleOrStatus / adminAuthService.updateAdminRoleOrStatus exist
// and are fully unit-tested, but no HTTP route called them yet.

import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');

export const listTeamMembersQuerySchema = paginationQuerySchema;

export const teamMemberIdParamSchema = z.object({ id: objectIdSchema });

// role/status enums duplicated here (not imported from user.model.ts)
// matches this codebase's existing pattern of enum literals living in
// Zod schemas independently of the Mongoose schema's `enum:` array (see
// employeeSchemas.ts/companySchemas.ts) — Zod is what actually rejects a
// bad request before it ever reaches Mongoose validation.
export const updateTeamMemberRoleOrStatusSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'manager', 'employee']).optional(),
    status: z.enum(['active', 'invited', 'disabled']).optional(),
  })
  .strict()
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: 'At least one of role or status must be provided.',
  });
