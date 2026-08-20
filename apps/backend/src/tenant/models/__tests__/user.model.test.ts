import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { TenantUserModel } from '../user.model.js';

function buildValidUser(overrides: Record<string, unknown> = {}) {
  return new TenantUserModel({
    companyId: new Types.ObjectId(),
    email: 'owner@example.com',
    passwordHash: 'a-bcrypt-or-argon2-hash',
    name: 'Jane Owner',
    role: 'owner',
    ...overrides,
  });
}

describe('TenantUserModel validation', () => {
  it('accepts a well-formed tenant user', () => {
    const user = buildValidUser();
    expect(user.validateSync()).toBeUndefined();
  });

  it('requires companyId', () => {
    const user = buildValidUser({ companyId: undefined });
    expect(user.validateSync()?.errors.companyId).toBeDefined();
  });

  it('requires a valid email format', () => {
    const user = buildValidUser({ email: 'not-an-email' });
    expect(user.validateSync()?.errors.email).toBeDefined();
  });

  it('lowercases email on validation', () => {
    const user = buildValidUser({ email: 'Owner@Example.COM' });
    user.validateSync();
    expect(user.email).toBe('owner@example.com');
  });

  it('requires passwordHash', () => {
    const user = buildValidUser({ passwordHash: undefined });
    expect(user.validateSync()?.errors.passwordHash).toBeDefined();
  });

  it('excludes passwordHash from default toJSON/toObject-visible paths (select: false)', () => {
    const path = TenantUserModel.schema.path('passwordHash');
    expect(path.options.select).toBe(false);
  });

  it('rejects an invalid role', () => {
    const user = buildValidUser({ role: 'superadmin' });
    expect(user.validateSync()?.errors.role).toBeDefined();
  });

  it('defaults status to "invited"', () => {
    const user = buildValidUser();
    expect(user.status).toBe('invited');
  });

  it('rejects a malformed phone number when provided', () => {
    const user = buildValidUser({ phone: 'abc' });
    expect(user.validateSync()?.errors.phone).toBeDefined();
  });

  it('accepts a well-formed phone number when provided', () => {
    const user = buildValidUser({ phone: '+47 400 00 000' });
    expect(user.validateSync()).toBeUndefined();
  });
});
