// apps/backend/src/admin/repositories/companyAdminRepository.ts
//
// Same "retrieve the already-registered Mongoose model by name" pattern
// as companyExistsAdapter.ts (see that file's header for the full
// reasoning — eslint.config.js forbids admin/** from importing anything
// under tenant/**). This is the ONE place `status` is ever written for a
// company — CompanyRepositoryPort.updateById (tenant/repositories/
// types.ts) deliberately excludes it: "status changes are
// platform-admin-only, never a generic profile PATCH."

import { model, type Document } from 'mongoose';

export type AdminCompanyStatus = 'draft' | 'active' | 'suspended';

export interface AdminCompanyRecord {
  id: string;
  name: string;
  slug: string;
  status: AdminCompanyStatus;
  timezone: string;
  currency: string;
  createdAt: Date;
}

/** Structural shape this file actually reads off the Company document. */
interface CompanyDocumentShape extends Document {
  name: string;
  slug: string;
  status: AdminCompanyStatus;
  timezone: string;
  currency: string;
  createdAt: Date;
}

function toAdminCompanyRecord(doc: CompanyDocumentShape): AdminCompanyRecord {
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    status: doc.status,
    timezone: doc.timezone,
    currency: doc.currency,
    createdAt: doc.createdAt,
  };
}

function getCompanyModel() {
  return model<CompanyDocumentShape>('Company');
}

export const companyAdminRepository = {
  async list(options: {
    page: number;
    limit: number;
    status?: AdminCompanyStatus;
  }): Promise<{ items: AdminCompanyRecord[]; total: number }> {
    const filter = options.status ? { status: options.status } : {};
    const skip = (options.page - 1) * options.limit;
    const CompanyModel = getCompanyModel();

    const [docs, total] = await Promise.all([
      CompanyModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(options.limit).exec(),
      CompanyModel.countDocuments(filter).exec(),
    ]);

    return { items: docs.map(toAdminCompanyRecord), total };
  },

  async findById(companyId: string): Promise<AdminCompanyRecord | null> {
    const doc = await getCompanyModel().findById(companyId).exec();
    return doc ? toAdminCompanyRecord(doc) : null;
  },

  async updateStatus(
    companyId: string,
    status: AdminCompanyStatus,
  ): Promise<AdminCompanyRecord | null> {
    const doc = await getCompanyModel()
      .findByIdAndUpdate(companyId, { $set: { status } }, { new: true })
      .exec();
    return doc ? toAdminCompanyRecord(doc) : null;
  },
};
