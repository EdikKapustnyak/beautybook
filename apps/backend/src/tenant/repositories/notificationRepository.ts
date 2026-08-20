import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import {
  NotificationModel,
  type NotificationDocument,
  type NotificationType,
} from '../models/notification.model.js';

interface MongoDuplicateKeyError {
  code?: number;
}
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as MongoDuplicateKeyError).code === 11000
  );
}

export type CreateNotificationInput = {
  bookingId?: string | Types.ObjectId;
  type: NotificationType;
  recipient: string;
  body: string;
  dedupeKey: string;
  scheduledAt: Date;
};

export const notificationRepository = {
  async findOrCreateInCompany(
    companyId: string | Types.ObjectId,
    data: CreateNotificationInput,
  ): Promise<NotificationDocument> {
    try {
      return await NotificationModel.create(withTenantScope(String(companyId), data));
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await NotificationModel.findOne({ dedupeKey: data.dedupeKey }).exec();
      if (!existing) {
        throw error;
      }
      return existing;
    }
  },

  async findById(id: string): Promise<NotificationDocument | null> {
    return NotificationModel.findById(id).exec();
  },

  async claimForSending(id: string): Promise<NotificationDocument | null> {
    return NotificationModel.findOneAndUpdate(
      {
        _id: id,
        status: { $in: ['pending', 'failed'] },
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
      },
      { $set: { status: 'sending' }, $inc: { attempts: 1 } },
      { new: true },
    ).exec();
  },

  async markSent(id: string, providerMessageId: string): Promise<boolean> {
    const result = await NotificationModel.updateOne(
      { _id: id, status: 'sending' },
      { $set: { status: 'sent', sentAt: new Date(), providerMessageId } },
    ).exec();
    return result.modifiedCount > 0;
  },

  async markFailed(id: string, failureReason: string): Promise<void> {
    await NotificationModel.updateOne(
      { _id: id, status: 'sending' },
      { $set: { status: 'failed', failureReason: failureReason.slice(0, 500) } },
    ).exec();
  },
};
