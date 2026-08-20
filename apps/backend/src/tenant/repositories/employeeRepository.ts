import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import {
  EmployeeModel,
  type EmployeeAttrs,
  type EmployeeDocument,
} from '../models/employee.model.js';

export type CreateEmployeeInput = Pick<EmployeeAttrs, 'name'> &
  Partial<
    Omit<EmployeeAttrs, 'companyId' | 'name' | 'serviceIds'> & {
      serviceIds: (string | Types.ObjectId)[];
    }
  >;

export type UpdateEmployeeInput = Partial<
  Omit<EmployeeAttrs, 'companyId' | 'serviceIds'> & { serviceIds: (string | Types.ObjectId)[] }
>;

export interface ListEmployeesOptions {
  page: number;
  limit: number;
  activeOnly?: boolean;
}

export const employeeRepository = {
  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateEmployeeInput,
  ): Promise<EmployeeDocument> {
    return EmployeeModel.create(withTenantScope(String(companyId), data));
  },

  async findByIdInCompany(
    employeeId: string,
    companyId: string | Types.ObjectId,
  ): Promise<EmployeeDocument | null> {
    return EmployeeModel.findOne(withTenantScope(String(companyId), { _id: employeeId })).exec();
  },

  async listInCompany(
    companyId: string | Types.ObjectId,
    options: ListEmployeesOptions,
  ): Promise<{ items: EmployeeDocument[]; total: number }> {
    const filter = withTenantScope(String(companyId), options.activeOnly ? { active: true } : {});
    const skip = (options.page - 1) * options.limit;

    const [items, total] = await Promise.all([
      EmployeeModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(options.limit).exec(),
      EmployeeModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },

  async updateByIdInCompany(
    employeeId: string,
    companyId: string | Types.ObjectId,
    updates: UpdateEmployeeInput,
  ): Promise<EmployeeDocument | null> {
    return EmployeeModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: employeeId }),
      updates,
      { new: true, runValidators: true },
    ).exec();
  },

  async deleteByIdInCompany(
    employeeId: string,
    companyId: string | Types.ObjectId,
  ): Promise<boolean> {
    const result = await EmployeeModel.deleteOne(
      withTenantScope(String(companyId), { _id: employeeId }),
    ).exec();
    return result.deletedCount > 0;
  },

  /**
   * Used to validate a Service's `employeeIds` on create/update — every id
   * must both exist AND belong to the caller's own company. Returns the
   * subset of `employeeIds` that do NOT satisfy that (i.e. invalid/foreign
   * ids), so the caller can report exactly which ones failed without
   * leaking whether a foreign id exists in another tenant at all.
   */
  async findInvalidIdsForCompany(
    employeeIds: string[],
    companyId: string | Types.ObjectId,
  ): Promise<string[]> {
    if (employeeIds.length === 0) {
      return [];
    }
    const found = await EmployeeModel.find(
      withTenantScope(String(companyId), { _id: { $in: employeeIds } }),
    )
      .select('_id')
      .exec();
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    return employeeIds.filter((id) => !foundIds.has(id));
  },
};
