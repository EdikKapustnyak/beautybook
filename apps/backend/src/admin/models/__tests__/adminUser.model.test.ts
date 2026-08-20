import { describe, expect, it } from 'vitest';

import { AdminUserModel } from '../adminUser.model.js';

function buildValidAdminUser(overrides: Record<string, unknown> = {}) {
  return new AdminUserModel({
    email: 'ops@beautybook.no',
    passwordHash: 'a-bcrypt-hash',
    name: 'Ops Lead',
    role: 'superadmin',
    ...overrides,
  });
}

describe('AdminUserModel validation', () => {
  it('accepts a well-formed admin user', () => {
    const admin = buildValidAdminUser();
    expect(admin.validateSync()).toBeUndefined();
  });

  it('requires a valid email format', () => {
    const admin = buildValidAdminUser({ email: 'not-an-email' });
    expect(admin.validateSync()?.errors.email).toBeDefined();
  });

  it('requires passwordHash', () => {
    const admin = buildValidAdminUser({ passwordHash: undefined });
    expect(admin.validateSync()?.errors.passwordHash).toBeDefined();
  });

  it('excludes passwordHash from default-selected paths (select: false)', () => {
    const path = AdminUserModel.schema.path('passwordHash');
    expect(path.options.select).toBe(false);
  });

  it('rejects an invalid role', () => {
    const admin = buildValidAdminUser({ role: 'owner' });
    expect(admin.validateSync()?.errors.role).toBeDefined();
  });

  it('defaults status to "active"', () => {
    const admin = buildValidAdminUser();
    expect(admin.status).toBe('active');
  });
});
