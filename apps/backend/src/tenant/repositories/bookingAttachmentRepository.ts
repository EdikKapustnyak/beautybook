import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import {
  BookingAttachmentModel,
  type BookingAttachmentDocument,
} from '../models/bookingAttachment.model.js';

export type CreateBookingAttachmentInput = {
  bookingId: string | Types.ObjectId;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date;
};

export const bookingAttachmentRepository = {
  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateBookingAttachmentInput,
  ): Promise<BookingAttachmentDocument> {
    return BookingAttachmentModel.create(withTenantScope(String(companyId), data));
  },

  async findByIdInCompany(
    attachmentId: string,
    companyId: string | Types.ObjectId,
  ): Promise<BookingAttachmentDocument | null> {
    return BookingAttachmentModel.findOne(
      withTenantScope(String(companyId), { _id: attachmentId, status: 'active' }),
    ).exec();
  },

  async listForBookingInCompany(
    bookingId: string,
    companyId: string | Types.ObjectId,
  ): Promise<BookingAttachmentDocument[]> {
    return BookingAttachmentModel.find(
      withTenantScope(String(companyId), { bookingId, status: 'active' }),
    )
      .sort({ createdAt: 1 })
      .exec();
  },

  /**
   * Everything currently past its retention window and not yet cleaned
   * up — the cleanup job's input set. Not tenant-scoped by design: the
   * cleanup job runs across all companies (it's an internal maintenance
   * job, never triggered by a tenant-scoped HTTP request).
   */
  async findExpired(now: Date, limit: number): Promise<BookingAttachmentDocument[]> {
    return BookingAttachmentModel.find({ status: 'active', expiresAt: { $lte: now } })
      .limit(limit)
      .exec();
  },

  /**
   * Atomic — only succeeds if the attachment was still `active` at the
   * moment of the update. This is what makes the cleanup job safe to
   * re-run concurrently/repeatedly (dev-tasks.md §14 "failed cleanup
   * retried"): a record is only ever marked deleted once its storage
   * object is confirmed gone, and marking is idempotent-safe against
   * re-processing the same record twice.
   */
  async markDeletedIfActive(attachmentId: string | Types.ObjectId): Promise<boolean> {
    const result = await BookingAttachmentModel.updateOne(
      { _id: attachmentId, status: 'active' },
      { $set: { status: 'deleted' } },
    ).exec();
    return result.modifiedCount > 0;
  },

  async deleteByIdInCompany(
    attachmentId: string,
    companyId: string | Types.ObjectId,
  ): Promise<BookingAttachmentDocument | null> {
    return BookingAttachmentModel.findOneAndUpdate(
      withTenantScope(String(companyId), { _id: attachmentId, status: 'active' }),
      { $set: { status: 'deleted' } },
      { new: true },
    ).exec();
  },
};
