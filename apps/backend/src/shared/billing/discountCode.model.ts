// apps/backend/src/shared/billing/discountCode.model.ts
//
// Distinct from PlanConfig.discountPercent (an automatic, always-applied
// discount for a whole plan) — this is a CODE a customer types in at
// Stripe Checkout (Stripe's own Promotion Code redemption UI, enabled
// via `allow_promotion_codes: true` — see stripeGateway.instance.ts's
// createCheckoutSession). Backed by a real Stripe Coupon + PromotionCode
// created at admin-creation time (not lazily at checkout, unlike
// PlanConfig's per-plan discount) — see stripeGateway.ts's
// createPromotionCode doc comment for why.
//
// Lives in shared/billing/ (not admin/) for the same reason
// Subscription/PlanConfig do — see types.ts's header — even though only
// the admin surface writes to it today: if a tenant-facing "enter a
// promo code before checkout" preview is ever built, it will need to
// read this collection too, and this avoids a second relocation.

import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from './subscription.model.js';

export interface DiscountCodeAttrs {
  /** Always stored uppercase — Stripe Promotion Codes are case-sensitive at redemption. */
  code: string;
  percentOff: number;
  /** Empty array = applies to every plan. */
  appliesToPlans: SubscriptionPlan[];
  maxRedemptions?: number;
  expiresAt?: Date;
  active: boolean;
  stripeCouponId: string;
  stripePromotionCodeId: string;
}

export type DiscountCodeDocument = HydratedDocument<DiscountCodeAttrs>;

const discountCodeSchema = new Schema<DiscountCodeAttrs>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    percentOff: { type: Number, required: true, min: 1, max: 100 },
    appliesToPlans: { type: [String], enum: SUBSCRIPTION_PLANS, default: [] },
    maxRedemptions: { type: Number, min: 1 },
    expiresAt: { type: Date },
    active: { type: Boolean, required: true, default: true },
    stripeCouponId: { type: String, required: true },
    stripePromotionCodeId: { type: String, required: true },
  },
  { timestamps: true },
);

export const DiscountCodeModel: Model<DiscountCodeAttrs> = model<DiscountCodeAttrs>(
  'DiscountCode',
  discountCodeSchema,
);
