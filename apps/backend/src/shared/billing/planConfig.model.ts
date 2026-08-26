// apps/backend/src/shared/billing/planConfig.model.ts
//
// Platform-wide plan configuration — NOT tenant-scoped (no companyId;
// one row per SUBSCRIPTION_PLAN, shared across every company). Lives
// under tenant/models/ for proximity to subscription.model.ts (the thing
// that actually reads it, in subscriptionService.ts), the same way
// Company itself lives here despite being platform-created.
//
// Written only by the platform admin surface (admin/controllers/
// planConfigController.ts, superadmin-only). Read by
// subscriptionService.ts's createCheckoutSession to decide which Stripe
// Price/Coupon to use.
//
// IMPORTANT — Stripe Price objects are immutable (Stripe's own API
// design, not a limitation of this codebase): "changing a plan's price"
// can never mean editing the amount on an existing `stripePriceId` in
// place. What this model actually lets a platform admin do:
//   - `priceAmount`/`currency` — an INFORMATIONAL display price (e.g. for
//     a future public pricing page). Changing these alone does NOT change
//     what Stripe actually charges.
//   - `stripePriceId` — the REAL, currently-active Stripe Price for this
//     plan. To genuinely change what's charged, an admin creates a new
//     Price in the Stripe Dashboard (or via the API) and pastes its id
//     here — this field is what checkout actually uses.
//   - `discountPercent` — applied at checkout via a Stripe Coupon
//     (stripeGateway.ts's findOrCreatePercentOffCoupon), which IS a real,
//     functional discount Stripe applies, not just cosmetic.

import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from './subscription.model.js';

export interface PlanConfigAttrs {
  plan: SubscriptionPlan;
  displayName: string;
  /** Minor currency units (e.g. øre, cents) — avoids floating-point money. */
  priceAmount: number;
  currency: string;
  /** 0 = no discount. Whole percentage points only (Stripe Coupons require integers). */
  discountPercent: number;
  stripePriceId: string;
  active: boolean;
}

export type PlanConfigDocument = HydratedDocument<PlanConfigAttrs>;

const planConfigSchema = new Schema<PlanConfigAttrs>(
  {
    plan: { type: String, enum: SUBSCRIPTION_PLANS, required: true, unique: true },
    displayName: { type: String, required: true, trim: true, maxlength: 200 },
    priceAmount: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    discountPercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    stripePriceId: { type: String, required: true, trim: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

export const PlanConfigModel: Model<PlanConfigAttrs> = model<PlanConfigAttrs>(
  'PlanConfig',
  planConfigSchema,
);
