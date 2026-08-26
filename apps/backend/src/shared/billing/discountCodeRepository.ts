// apps/backend/src/shared/billing/discountCodeRepository.ts

import {
  DiscountCodeModel,
  type DiscountCodeAttrs,
  type DiscountCodeDocument,
} from './discountCode.model.js';

export type CreateDiscountCodeInput = Pick<
  DiscountCodeAttrs,
  'code' | 'percentOff' | 'stripeCouponId' | 'stripePromotionCodeId'
> &
  Partial<Pick<DiscountCodeAttrs, 'appliesToPlans' | 'maxRedemptions' | 'expiresAt'>>;

export const discountCodeRepository = {
  async list(): Promise<DiscountCodeDocument[]> {
    return DiscountCodeModel.find({}).sort({ createdAt: -1 }).exec();
  },

  async findByCode(code: string): Promise<DiscountCodeDocument | null> {
    return DiscountCodeModel.findOne({ code: code.toUpperCase() }).exec();
  },

  async create(data: CreateDiscountCodeInput): Promise<DiscountCodeDocument> {
    return DiscountCodeModel.create(data);
  },

  async setActive(code: string, active: boolean): Promise<DiscountCodeDocument | null> {
    return DiscountCodeModel.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $set: { active } },
      { new: true },
    ).exec();
  },
};
