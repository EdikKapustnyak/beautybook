// apps/backend/src/admin/repositories/userAdminRepository.ts
//
// Same "retrieve the already-registered Mongoose model by name" pattern
// as companyExistsAdapter.ts/companyAdminRepository.ts (see either
// file's header for the full reasoning). Cross-tenant by design: this is
// the ONE place in the whole codebase a query is deliberately NOT
// scoped to a single companyId — a platform admin legitimately needs to
// see accounts across every company, unlike every tenant-side repository
// (security-measures.md §4's tenant-isolation rule applies to the
// tenant surface, not to this platform-admin read).

import { model, type Document } from 'mongoose';

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  companyId: string;
  role: string;
  status: string;
  lastLoginAt?: Date;
}

/** Structural shape this file actually reads off the TenantUser document. */
interface TenantUserDocumentShape extends Document {
  email: string;
  name: string;
  companyId: unknown;
  role: string;
  status: string;
  lastLoginAt?: Date;
}

function toAdminUserRecord(doc: TenantUserDocumentShape): AdminUserRecord {
  return {
    id: String(doc._id),
    email: doc.email,
    name: doc.name,
    companyId: String(doc.companyId),
    role: doc.role,
    status: doc.status,
    lastLoginAt: doc.lastLoginAt,
  };
}

function getTenantUserModel() {
  return model<TenantUserDocumentShape>('TenantUser');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const userAdminRepository = {
  /**
   * `search` matches the START of the email (case-insensitive) — never
   * arbitrary regex from the caller (security-measures.md §7's regex-
   * injection/ReDoS reasoning applies here too, even though this is an
   * admin-only surface: defense in depth costs nothing).
   */
  async list(options: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{ items: AdminUserRecord[]; total: number }> {
    const filter = options.search
      ? { email: { $regex: `^${escapeRegex(options.search)}`, $options: 'i' } }
      : {};
    const skip = (options.page - 1) * options.limit;
    const TenantUserModel = getTenantUserModel();

    const [docs, total] = await Promise.all([
      TenantUserModel.find(filter).sort({ email: 1 }).skip(skip).limit(options.limit).exec(),
      TenantUserModel.countDocuments(filter).exec(),
    ]);

    return { items: docs.map(toAdminUserRecord), total };
  },
};
