import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const OTP_PURPOSES = ['booking_phone_verification'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export interface OtpAttrs {
  companyId: Types.ObjectId;
  phone: string;
  purpose: OtpPurpose;
  /** SHA-256 hash of the code. The plaintext code is never stored. */
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verifiedAt?: Date;
  /** Managed by Mongoose (`{ timestamps: true }`) — declared here so the repository adapter can read it for the resend-cooldown check. */
  createdAt: Date;
}

export type OtpDocument = HydratedDocument<OtpAttrs>;

const otpSchema = new Schema<OtpAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    phone: { type: String, required: true, trim: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, min: 1 },
    verifiedAt: { type: Date },
  },
  { timestamps: true },
);

otpSchema.index({ companyId: 1, phone: 1, purpose: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel: Model<OtpAttrs> = model<OtpAttrs>('Otp', otpSchema);
