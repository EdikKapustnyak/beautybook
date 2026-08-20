import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * One row per issued refresh token. Rotation + reuse detection
 * (security-measures.md §2/§16) work like this:
 *  - login/refresh creates a new session row holding the HASH of a fresh
 *    opaque refresh token (plaintext is only ever returned once, in the
 *    response, never stored).
 *  - refreshing again atomically revokes this row (see
 *    sessionRepository.revokeIfActive — conditional on revokedAt being
 *    unset) and creates the next row, linked via replacedBySessionId.
 *  - if a refresh token is presented AFTER its session is already revoked,
 *    that is reuse of a stolen/replayed token — the caller must revoke the
 *    entire session family for that user, not just reject the request.
 */
export interface SessionAttrs {
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: Types.ObjectId;
}

export type SessionDocument = HydratedDocument<SessionAttrs>;

const sessionSchema = new Schema<SessionAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    refreshTokenHash: { type: String, required: true },
    userAgent: { type: String, maxlength: 512 },
    ip: { type: String, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
  },
  { timestamps: true },
);

sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
// TTL index — Mongo removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel: Model<SessionAttrs> = model<SessionAttrs>('Session', sessionSchema);
