import { describe, expect, it } from 'vitest';

import { teamMemberIdParamSchema, updateTeamMemberRoleOrStatusSchema } from '../teamSchemas.js';

describe('teamMemberIdParamSchema', () => {
  it('accepts a valid ObjectId', () => {
    const result = teamMemberIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ObjectId string', () => {
    const result = teamMemberIdParamSchema.safeParse({ id: 'not-an-id' });
    expect(result.success).toBe(false);
  });
});

describe('updateTeamMemberRoleOrStatusSchema', () => {
  it('accepts a role-only update', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({ role: 'manager' });
    expect(result.success).toBe(true);
  });

  it('accepts a status-only update', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({ status: 'disabled' });
    expect(result.success).toBe(true);
  });

  it('accepts both role and status together', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({
      role: 'admin',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body (at least one of role/status is required)', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an invalid role value', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({ role: 'superadmin' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status value', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({ status: 'banned' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict() — mass-assignment defense, e.g. companyId/_id/tokenVersion)', () => {
    const result = updateTeamMemberRoleOrStatusSchema.safeParse({
      role: 'manager',
      tokenVersion: 999,
    });
    expect(result.success).toBe(false);
  });
});
