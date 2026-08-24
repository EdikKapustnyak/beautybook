import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import {
  TenantUserModel,
  type TenantUserAttrs,
  type TenantUserDocument,
} from '../models/user.model.js';

export type CreateTenantUserInput = Pick<
  TenantUserAttrs,
  'email' | 'passwordHash' | 'name' | 'role'
> &
  Partial<Pick<TenantUserAttrs, 'phone' | 'status'>>;

export const userRepository = {
  /**
   * The ONLY method in this repository that is not companyId-scoped.
   * Used exclusively during login, before the caller has an authenticated
   * tenant context — safe because email is globally unique
   * (see user.model.ts). `passwordHash` is explicitly re-selected since
   * the schema excludes it by default.
   */
  async findByEmailForLogin(email: string): Promise<TenantUserDocument | null> {
    return TenantUserModel.findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();
  },

  async findByIdInCompany(
    userId: string,
    companyId: string | Types.ObjectId,
  ): Promise<TenantUserDocument | null> {
    return TenantUserModel.findOne(withTenantScope(String(companyId), { _id: userId })).exec();
  },

  async listByCompany(companyId: string | Types.ObjectId): Promise<TenantUserDocument[]> {
    return TenantUserModel.find(withTenantScope(String(companyId), {})).exec();
  },

  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateTenantUserInput,
  ): Promise<TenantUserDocument> {
    return TenantUserModel.create(withTenantScope(String(companyId), data));
  },

  async updateByIdInCompany(
    userId: string,
    companyId: string | Types.ObjectId,
    // Round 3 finding #1: `role`/`status` deliberately EXCLUDED from this
    // type — see updateRoleOrStatusInCompany below. Previously this
    // accepted `role`/`status` too, which compiled fine but silently
    // skipped the tokenVersion bump (no `$inc`), meaning a future caller
    // using the "obvious" generic update method for a role/status change
    // would compile clean, pass tests, and quietly undo the round-2
    // stale-role-window fix. Making the omission a compile-time error is
    // the fix — see stale-role-window-fix follow-up notes.
    updates: Partial<Pick<TenantUserAttrs, 'name' | 'phone' | 'lastLoginAt'>>,
  ): Promise<TenantUserDocument | null> {
    return TenantUserModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: userId }),
      updates,
      { new: true, runValidators: true },
    ).exec();
  },

  /**
   * Dedicated role/status update path — atomically bumps `tokenVersion`
   * in the SAME update whenever `role` or `status` is present, so the
   * two can never drift apart (a role/status change without a matching
   * tokenVersion bump would silently reopen the stale-access-token
   * window this method exists to close). See
   * shared/security/tokenVersionRevocation.ts and
   * stale-role-window-fix_1.md. Deliberately separate from
   * `updateByIdInCompany` above — see the port interface's doc comment
   * for why this isn't just folded into the generic update.
   */
  async updateRoleOrStatusInCompany(
    userId: string,
    companyId: string | Types.ObjectId,
    updates: Partial<Pick<TenantUserAttrs, 'role' | 'status'>>,
  ): Promise<TenantUserDocument | null> {
    return TenantUserModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: userId }),
      { $set: updates, $inc: { tokenVersion: 1 } },
      { new: true, runValidators: true },
    ).exec();
  },

  /**
   * NOT companyId-scoped, deliberately — used after password-reset-token
   * verification and by the authenticated "change my password" flow,
   * where the caller has already proven ownership of the account by other
   * means (a valid reset token, or the current session's own userId).
   */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await TenantUserModel.findByIdAndUpdate(userId, { passwordHash }).exec();
  },

  async updateLastLoginAt(userId: string, date: Date): Promise<void> {
    await TenantUserModel.findByIdAndUpdate(userId, { lastLoginAt: date }).exec();
  },
};
