import type { Types } from 'mongoose';

import {
  PasswordResetTokenModel,
  type PasswordResetTokenDocument,
} from '../models/passwordResetToken.model.js';

export const passwordResetTokenRepository = {
  async create(data: {
    userId: string | Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenDocument> {
    return PasswordResetTokenModel.create(data);
  },

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenDocument | null> {
    return PasswordResetTokenModel.findOne({ tokenHash }).exec();
  },

  /**
   * Atomically marks the token used ONLY if it was not already used.
   * Returns false on reuse — see security-measures.md §1 (single-use).
   */
  async markUsedIfUnused(tokenId: string | Types.ObjectId): Promise<boolean> {
    const result = await PasswordResetTokenModel.updateOne(
      { _id: tokenId, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
    ).exec();
    return result.modifiedCount > 0;
  },
};
