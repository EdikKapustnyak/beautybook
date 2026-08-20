import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import { OtpModel, type OtpDocument, type OtpPurpose } from '../models/otp.model.js';

export type CreateOtpInput = {
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  maxAttempts: number;
};

export const otpRepository = {
  async createInCompany(
    companyId: string | Types.ObjectId,
    data: CreateOtpInput,
  ): Promise<OtpDocument> {
    return OtpModel.create(withTenantScope(String(companyId), data));
  },

  async findLatestByPhoneInCompany(
    phone: string,
    purpose: OtpPurpose,
    companyId: string | Types.ObjectId,
  ): Promise<OtpDocument | null> {
    return OtpModel.findOne(withTenantScope(String(companyId), { phone, purpose }))
      .sort({ createdAt: -1 })
      .exec();
  },

  async findById(otpId: string): Promise<OtpDocument | null> {
    return OtpModel.findById(otpId).exec();
  },

  /**
   * Single atomic update enforcing all three conditions at once — not
   * expired, not already verified, still under maxAttempts — via a Mongo
   * `$expr` comparing `attempts` to `maxAttempts` (both fields on the same
   * document). This is what makes brute-force lockout and concurrent
   * verification attempts correct under a race: two simultaneous calls
   * for the same OTP can't both "win" the same attempt slot.
   */
  async claimAttempt(otpId: string): Promise<OtpDocument | null> {
    return OtpModel.findOneAndUpdate(
      {
        _id: otpId,
        verifiedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
      },
      { $inc: { attempts: 1 } },
      { new: true },
    ).exec();
  },

  async markVerifiedIfUnverified(otpId: string): Promise<boolean> {
    const result = await OtpModel.updateOne(
      { _id: otpId, verifiedAt: { $exists: false } },
      { $set: { verifiedAt: new Date() } },
    ).exec();
    return result.modifiedCount > 0;
  },
};
