import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import { BlockedTimeModel, type BlockedTimeDocument } from '../models/blockedTime.model.js';

export type CreateBlockedTimeInput = {
  employeeId?: string | Types.ObjectId;
  startAt: Date;
  endAt: Date;
  reason?: string;
};

export interface ListBlockedTimeOptions {
  page: number;
  limit: number;
  employeeId?: string;
  /** Only intervals that overlap [from, to), when provided. */
  from?: Date;
  to?: Date;
}

export const blockedTimeRepository = {
  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateBlockedTimeInput,
  ): Promise<BlockedTimeDocument> {
    return BlockedTimeModel.create(withTenantScope(String(companyId), data));
  },

  async findByIdInCompany(
    blockedTimeId: string,
    companyId: string | Types.ObjectId,
  ): Promise<BlockedTimeDocument | null> {
    return BlockedTimeModel.findOne(
      withTenantScope(String(companyId), { _id: blockedTimeId }),
    ).exec();
  },

  async listInCompany(
    companyId: string | Types.ObjectId,
    options: ListBlockedTimeOptions,
  ): Promise<{ items: BlockedTimeDocument[]; total: number }> {
    const dateOverlapFilter =
      options.from || options.to
        ? {
            ...(options.to ? { startAt: { $lt: options.to } } : {}),
            ...(options.from ? { endAt: { $gt: options.from } } : {}),
          }
        : {};

    const filter = withTenantScope(String(companyId), {
      ...(options.employeeId ? { employeeId: options.employeeId } : {}),
      ...dateOverlapFilter,
    });
    const skip = (options.page - 1) * options.limit;

    const [items, total] = await Promise.all([
      BlockedTimeModel.find(filter).sort({ startAt: 1 }).skip(skip).limit(options.limit).exec(),
      BlockedTimeModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },

  async deleteByIdInCompany(
    blockedTimeId: string,
    companyId: string | Types.ObjectId,
  ): Promise<boolean> {
    const result = await BlockedTimeModel.deleteOne(
      withTenantScope(String(companyId), { _id: blockedTimeId }),
    ).exec();
    return result.deletedCount > 0;
  },

  /**
   * Blocked intervals relevant to a single employee's availability on a
   * given date range: company-wide blocks (no `employeeId` set) PLUS
   * blocks specific to this employee. Used by the availability engine —
   * see tenant/services/availabilityEngine.ts.
   */
  async listForEmployeeAvailability(
    companyId: string | Types.ObjectId,
    employeeId: string | Types.ObjectId,
    range: { from: Date; to: Date },
  ): Promise<BlockedTimeDocument[]> {
    const filter = withTenantScope(String(companyId), {
      $or: [{ employeeId: { $exists: false } }, { employeeId }],
      startAt: { $lt: range.to },
      endAt: { $gt: range.from },
    });
    return BlockedTimeModel.find(filter).exec();
  },
};
