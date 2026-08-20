import type { Types } from 'mongoose';

import { SessionModel, type SessionAttrs, type SessionDocument } from '../models/session.model.js';

export const sessionRepository = {
  async create(data: {
    userId: string | Types.ObjectId;
    companyId: string | Types.ObjectId;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<SessionDocument> {
    return SessionModel.create(data);
  },

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionDocument | null> {
    return SessionModel.findOne({ refreshTokenHash }).exec();
  },

  /**
   * Atomically revokes a session ONLY if it was not already revoked.
   * Returns false when the session was already revoked — the caller must
   * treat that as refresh-token reuse (a stolen/replayed token) and revoke
   * the entire session family for the user, not just this one request.
   * See beautybook-security-measures.md §2/§16.
   */
  async revokeIfActive(
    sessionId: string | Types.ObjectId,
    replacedBySessionId?: string | Types.ObjectId,
  ): Promise<boolean> {
    const updates: Partial<SessionAttrs> = { revokedAt: new Date() };
    if (replacedBySessionId) {
      updates.replacedBySessionId = replacedBySessionId as SessionAttrs['replacedBySessionId'];
    }
    const result = await SessionModel.updateOne(
      { _id: sessionId, revokedAt: { $exists: false } },
      { $set: updates },
    ).exec();
    return result.modifiedCount > 0;
  },

  async revokeAllForUser(userId: string | Types.ObjectId): Promise<void> {
    await SessionModel.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },
};
