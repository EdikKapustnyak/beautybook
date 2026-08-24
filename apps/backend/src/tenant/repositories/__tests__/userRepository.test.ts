// apps/backend/src/tenant/repositories/__tests__/userRepository.test.ts
//
// This is the first test file directly against a concrete repository in
// this codebase (everywhere else, DB-facing logic is tested either as
// pure model validation with no connection, or at the service layer
// against in-memory fake ports). Justified here because the thing under
// test is a COMPILE-TIME guarantee, not a database round-trip — see
// round3-findings-and-fixes.md finding #1.
//
// The guarantee: `updateByIdInCompany`'s type must NOT accept `role` or
// `status`. Those fields silently skipped the `$inc: { tokenVersion: 1 }`
// bump that `updateRoleOrStatusInCompany` (the dedicated, correct method)
// applies — a future caller reaching for the "obvious" generic update
// method for a role/status change would compile clean, pass every
// existing test, and quietly reopen the stale-role-window-fix from round
// 2, with no runtime signal at all that anything had regressed.
//
// `@ts-expect-error` makes this a REAL regression guard: if someone ever
// widens the type back to include `role`/`status`, this line stops being
// a type error, and `@ts-expect-error` itself then fails to compile
// ("Unused '@ts-expect-error' directive") — `npm run typecheck` catches
// the regression immediately, without needing a database or even for
// this test to execute.
//
// `TenantUserModel.findOneAndUpdate` is mocked so the (intentionally
// type-invalid) call below doesn't attempt a real Mongo connection.

import { describe, expect, it, vi } from 'vitest';

import { TenantUserModel } from '../../models/user.model.js';
import { userRepository } from '../userRepository.js';

describe('userRepository.updateByIdInCompany — round3 finding #1 regression guard', () => {
  it('does not typecheck with role/status (compile-time guarantee, not a runtime behavior)', async () => {
    const spy = vi
      .spyOn(TenantUserModel, 'findOneAndUpdate')
      .mockReturnValue({ exec: async () => null } as ReturnType<
        typeof TenantUserModel.findOneAndUpdate
      >);

    // @ts-expect-error — role/status must be rejected by the type system;
    // if this stops erroring, the regression this test exists to catch
    // has happened. See file header.
    await userRepository.updateByIdInCompany('u1', 'c1', { role: 'owner' });

    spy.mockRestore();
  });

  it('still accepts the legitimately generic-updatable fields (name, phone, lastLoginAt)', async () => {
    const spy = vi
      .spyOn(TenantUserModel, 'findOneAndUpdate')
      .mockReturnValue({ exec: async () => null } as ReturnType<
        typeof TenantUserModel.findOneAndUpdate
      >);

    // No @ts-expect-error here — this call must remain valid.
    await userRepository.updateByIdInCompany('u1', 'c1', { name: 'New Name' });

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
