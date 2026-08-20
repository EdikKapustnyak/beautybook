import { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import { BookingModel, type BookingDocument, type BookingStatus } from '../models/booking.model.js';

export interface CreateBookingInput {
  id?: string | Types.ObjectId;
  employeeId: string | Types.ObjectId;
  customerId: string | Types.ObjectId;
  serviceId: string | Types.ObjectId;
  startAt: Date;
  endAt: Date;
  footprintEndAt: Date;
  status: BookingStatus;
  customerNote?: string;
  internalNote?: string;
  createdByUserId?: string | Types.ObjectId;
}

export interface ListBookingsOptions {
  page: number;
  limit: number;
  employeeId?: string;
  customerId?: string;
  status?: BookingStatus;
  from?: Date;
  to?: Date;
}

export const bookingRepository = {
  generateId(): string {
    return new Types.ObjectId().toHexString();
  },

  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateBookingInput,
  ): Promise<BookingDocument> {
    const { id, ...rest } = data;
    return BookingModel.create(
      withTenantScope(String(companyId), id ? { _id: id, ...rest } : rest),
    );
  },

  async findByIdInCompany(
    bookingId: string,
    companyId: string | Types.ObjectId,
  ): Promise<BookingDocument | null> {
    return BookingModel.findOne(withTenantScope(String(companyId), { _id: bookingId })).exec();
  },

  async listInCompany(
    companyId: string | Types.ObjectId,
    options: ListBookingsOptions,
  ): Promise<{ items: BookingDocument[]; total: number }> {
    const dateOverlapFilter =
      options.from || options.to
        ? {
            ...(options.to ? { startAt: { $lt: options.to } } : {}),
            ...(options.from ? { endAt: { $gt: options.from } } : {}),
          }
        : {};

    const filter = withTenantScope(String(companyId), {
      ...(options.employeeId ? { employeeId: options.employeeId } : {}),
      ...(options.customerId ? { customerId: options.customerId } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...dateOverlapFilter,
    });
    const skip = (options.page - 1) * options.limit;

    const [items, total] = await Promise.all([
      BookingModel.find(filter).sort({ startAt: 1 }).skip(skip).limit(options.limit).exec(),
      BookingModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },

  /**
   * Atomic conditional status transition — the `status: { $in: ... }`
   * clause in the filter is what makes this safe under concurrency: only
   * a request that finds the booking in one of the expected "from"
   * statuses at the moment of the update can succeed, so two concurrent
   * "cancel" + "complete" requests can't both apply.
   */
  async updateStatusIfCurrentIn(
    bookingId: string,
    companyId: string | Types.ObjectId,
    allowedFromStatuses: BookingStatus[],
    newStatus: BookingStatus,
    extra?: { cancellationReason?: string },
  ): Promise<BookingDocument | null> {
    return BookingModel.findOneAndUpdate(
      withTenantScope(String(companyId), {
        _id: bookingId,
        status: { $in: allowedFromStatuses },
      }),
      { $set: { status: newStatus, ...extra } },
      { new: true, runValidators: true },
    ).exec();
  },

  /**
   * Plain field update for reschedule (time fields) and note edits. No
   * status/concurrency guarantees of its own — reschedule gets its
   * atomicity from the SlotLock reservation happening before this is
   * ever called (see bookingService.rescheduleBooking).
   */
  async updateFieldsInCompany(
    bookingId: string,
    companyId: string | Types.ObjectId,
    updates: Partial<{
      startAt: Date;
      endAt: Date;
      footprintEndAt: Date;
      customerNote: string;
      internalNote: string;
    }>,
  ): Promise<BookingDocument | null> {
    return BookingModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: bookingId }),
      { $set: updates },
      { new: true, runValidators: true },
    ).exec();
  },
};
