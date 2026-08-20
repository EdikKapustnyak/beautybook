import type { Types } from 'mongoose';

import {
  AdminSessionModel,
  type AdminSessionAttrs,
  type AdminSessionDocument,
} from '../models/adminSession.model.js';

export const adminSessionRepository = {
  async create(data: {
    adminUserId: string | Types.ObjectId;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<AdminSessionDocument> {
    return AdminSessionModel.create(data);
  },

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<AdminSessionDocument | null> {
    return AdminSessionModel.findOne({ refreshTokenHash }).exec();
  },

  async revokeIfActive(
    sessionId: string | Types.ObjectId,
    replacedBySessionId?: string | Types.ObjectId,
  ): Promise<boolean> {
    const updates: Partial<AdminSessionAttrs> = { revokedAt: new Date() };
    if (replacedBySessionId) {
      updates.replacedBySessionId = replacedBySessionId as AdminSessionAttrs['replacedBySessionId'];
    }
    const result = await AdminSessionModel.updateOne(
      { _id: sessionId, revokedAt: { $exists: false } },
      { $set: updates },
    ).exec();
    return result.modifiedCount > 0;
  },

  async revokeAllForAdminUser(adminUserId: string | Types.ObjectId): Promise<void> {
    await AdminSessionModel.updateMany(
      { adminUserId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },
};
