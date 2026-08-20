import type { Types } from 'mongoose';

import { CompanyModel, type CompanyAttrs, type CompanyDocument } from '../models/company.model.js';

/**
 * Company is the tenant boundary itself, so — unlike every other tenant
 * repository — these lookups are intentionally NOT companyId-scoped.
 * `findBySlug` is also the one place a raw, unauthenticated string (a URL
 * slug) is allowed to resolve to a tenant; every other repository must
 * receive an already-verified companyId, never a raw request value.
 */
export const companyRepository = {
  async create(data: Pick<CompanyAttrs, 'name' | 'slug' | 'timezone' | 'currency'>) {
    return CompanyModel.create(data);
  },

  async findById(companyId: string | Types.ObjectId): Promise<CompanyDocument | null> {
    return CompanyModel.findById(companyId).exec();
  },

  async findBySlug(slug: string): Promise<CompanyDocument | null> {
    return CompanyModel.findOne({ slug: slug.toLowerCase().trim() }).exec();
  },

  async slugExists(slug: string): Promise<boolean> {
    const count = await CompanyModel.countDocuments({ slug: slug.toLowerCase().trim() }).exec();
    return count > 0;
  },

  async updateById(
    companyId: string | Types.ObjectId,
    updates: Partial<Omit<CompanyAttrs, 'slug'>>,
  ): Promise<CompanyDocument | null> {
    // slug is intentionally excluded from generic updates — changing it
    // changes the public URL and must go through a dedicated, audited flow
    // (later stage), not a generic PATCH.
    return CompanyModel.findByIdAndUpdate(companyId, updates, {
      new: true,
      runValidators: true,
    }).exec();
  },
};
