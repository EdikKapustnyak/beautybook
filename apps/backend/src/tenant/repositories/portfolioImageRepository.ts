import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import {
  PortfolioImageModel,
  type PortfolioImageDocument,
} from '../models/portfolioImage.model.js';

export type CreatePortfolioImageInput = {
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  order?: number;
};

export const portfolioImageRepository = {
  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreatePortfolioImageInput,
  ): Promise<PortfolioImageDocument> {
    return PortfolioImageModel.create(withTenantScope(String(companyId), data));
  },

  async findByIdInCompany(
    imageId: string,
    companyId: string | Types.ObjectId,
  ): Promise<PortfolioImageDocument | null> {
    return PortfolioImageModel.findOne(withTenantScope(String(companyId), { _id: imageId })).exec();
  },

  async listInCompany(
    companyId: string | Types.ObjectId,
    options: { activeOnly?: boolean } = {},
  ): Promise<PortfolioImageDocument[]> {
    const filter = withTenantScope(String(companyId), options.activeOnly ? { active: true } : {});
    return PortfolioImageModel.find(filter).sort({ order: 1, createdAt: 1 }).exec();
  },

  async deleteByIdInCompany(
    imageId: string,
    companyId: string | Types.ObjectId,
  ): Promise<PortfolioImageDocument | null> {
    return PortfolioImageModel.findOneAndDelete(
      withTenantScope(String(companyId), { _id: imageId }),
    ).exec();
  },

  /**
   * `orderedImageIds` must be exactly the set of image ids already
   * belonging to this company — the caller (service layer) verifies that
   * before calling this, since a partial/foreign id list here would
   * silently do nothing for the ids that don't match the tenant scope.
   */
  async reorderInCompany(
    companyId: string | Types.ObjectId,
    orderedImageIds: string[],
  ): Promise<void> {
    await Promise.all(
      orderedImageIds.map((imageId, index) =>
        PortfolioImageModel.updateOne(withTenantScope(String(companyId), { _id: imageId }), {
          $set: { order: index },
        }).exec(),
      ),
    );
  },
};
