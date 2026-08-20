import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface PasswordResetTokenAttrs {
  userId: Types.ObjectId;
  /** SHA-256 hash of the opaque reset token. The plaintext is never stored. */
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetTokenAttrs>;

const passwordResetTokenSchema = new Schema<PasswordResetTokenAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetTokenSchema.index({ userId: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetTokenModel: Model<PasswordResetTokenAttrs> =
  model<PasswordResetTokenAttrs>('PasswordResetToken', passwordResetTokenSchema);
