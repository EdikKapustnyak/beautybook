import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import { ServiceModel, type ServiceAttrs, type ServiceDocument } from '../models/service.model.js';

export type CreateServiceInput = Pick<
  ServiceAttrs,
  'name' | 'price' | 'currency' | 'durationMinutes'
> &
  Partial<
    Omit<
      ServiceAttrs,
      'companyId' | 'name' | 'price' | 'currency' | 'durationMinutes' | 'employeeIds'
    > & {
      employeeIds: (string | Types.ObjectId)[];
    }
  >;

export type UpdateServiceInput = Partial<
  Omit<ServiceAttrs, 'companyId' | 'employeeIds'> & { employeeIds: (string | Types.ObjectId)[] }
>;

export interface ListServicesOptions {
  page: number;
  limit: number;
  activeOnly?: boolean;
}

export const serviceRepository = {
  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateServiceInput,
  ): Promise<ServiceDocument> {
    return ServiceModel.create(withTenantScope(String(companyId), data));
  },

  async findByIdInCompany(
    serviceId: string,
    companyId: string | Types.ObjectId,
  ): Promise<ServiceDocument | null> {
    return ServiceModel.findOne(withTenantScope(String(companyId), { _id: serviceId })).exec();
  },

  async listInCompany(
    companyId: string | Types.ObjectId,
    options: ListServicesOptions,
  ): Promise<{ items: ServiceDocument[]; total: number }> {
    const filter = withTenantScope(String(companyId), options.activeOnly ? { active: true } : {});
    const skip = (options.page - 1) * options.limit;

    const [items, total] = await Promise.all([
      ServiceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(options.limit).exec(),
      ServiceModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },

  async updateByIdInCompany(
    serviceId: string,
    companyId: string | Types.ObjectId,
    updates: UpdateServiceInput,
  ): Promise<ServiceDocument | null> {
    return ServiceModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: serviceId }),
      updates,
      { new: true, runValidators: true },
    ).exec();
  },

  async deleteByIdInCompany(
    serviceId: string,
    companyId: string | Types.ObjectId,
  ): Promise<boolean> {
    const result = await ServiceModel.deleteOne(
      withTenantScope(String(companyId), { _id: serviceId }),
    ).exec();
    return result.deletedCount > 0;
  },

  /**
   * Mirror of employeeRepository.findInvalidIdsForCompany — used to
   * validate an Employee's `serviceIds` on create/update.
   */
  async findInvalidIdsForCompany(
    serviceIds: string[],
    companyId: string | Types.ObjectId,
  ): Promise<string[]> {
    if (serviceIds.length === 0) {
      return [];
    }
    const found = await ServiceModel.find(
      withTenantScope(String(companyId), { _id: { $in: serviceIds } }),
    )
      .select('_id')
      .exec();
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    return serviceIds.filter((id) => !foundIds.has(id));
  },
};
