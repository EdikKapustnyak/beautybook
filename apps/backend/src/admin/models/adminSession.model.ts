import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface AdminSessionAttrs {
  adminUserId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: Types.ObjectId;
}

export type AdminSessionDocument = HydratedDocument<AdminSessionAttrs>;

const adminSessionSchema = new Schema<AdminSessionAttrs>(
  {
    adminUserId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    refreshTokenHash: { type: String, required: true },
    userAgent: { type: String, maxlength: 512 },
    ip: { type: String, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'AdminSession' },
  },
  { timestamps: true },
);

adminSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
adminSessionSchema.index({ adminUserId: 1, revokedAt: 1 });
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminSessionModel: Model<AdminSessionAttrs> = model<AdminSessionAttrs>(
  'AdminSession',
  adminSessionSchema,
);
