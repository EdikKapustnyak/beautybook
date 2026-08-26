// apps/backend/src/shared/billing/subscription.model.ts
//
// technical-spec.md §3 (Subscription entity) / §14 / dev-tasks.md §21.
// Stripe is the source of truth for payment state (project-overview.md
// §20: "Stripe webhook является источником истины по состоянию
// платежа") — this collection is a local, queryable MIRROR of that
// state, kept in sync exclusively by stripeWebhookController.ts. Nothing
// in this codebase ever writes `status`/`currentPeriod*` from a
// frontend-supplied value — see subscriptionService.ts's handleWebhookEvent.

import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const SUBSCRIPTION_PLANS = ['starter', 'business'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * Mirrors Stripe's own subscription status values directly (not a
 * simplified BeautyBook-specific enum) — see
 * https://stripe.com/docs/api/subscriptions/object#subscription_object-status.
 * Keeping the same vocabulary as the webhook payload avoids a lossy
 * translation layer that could hide a status Stripe sends that this
 * codebase doesn't yet handle.
 */
export const SUBSCRIPTION_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionAttrs {
  companyId: Types.ObjectId;
  /**
   * Absent for an admin-granted (comped) subscription — see
   * `grantedByAdmin` below. Present for every Stripe-backed subscription
   * (created via findOrCreateCustomer BEFORE Checkout even starts, so
   * it's always there once real billing is involved).
   */
  stripeCustomerId?: string;
  /**
   * Absent between "Checkout session created" and "Checkout session
   * completed" — a company can have a Stripe Customer (and thus a
   * Subscription document, so checkout.session.completed has something
   * to upsert into) before Stripe has actually created the underlying
   * Subscription object. Always absent for an admin-granted subscription.
   */
  stripeSubscriptionId?: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  /**
   * true when a platform admin set this directly
   * (admin/controllers/adminSubscriptionController.ts's grant endpoint)
   * rather than it originating from a real Stripe payment — e.g. a comped
   * account, a partner deal, or a manually-negotiated arrangement. Kept
   * as an explicit, visible marker rather than inferring "no
   * stripeCustomerId means admin-granted" so the provenance survives
   * even if this company later ALSO goes through real Checkout (at which
   * point stripeCustomerId gets set too, but this flag's history is
   * still worth keeping distinguishable via grantedReason below).
   */
  grantedByAdmin: boolean;
  /** Free-text note for why an admin granted this — e.g. "partner deal", "beta tester". Never shown to the company. */
  grantedReason?: string;
}

export type SubscriptionDocument = HydratedDocument<SubscriptionAttrs>;

const subscriptionSchema = new Schema<SubscriptionAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
    stripeCustomerId: { type: String, unique: true, sparse: true },
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    plan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, default: 'incomplete' },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, required: true, default: false },
    grantedByAdmin: { type: Boolean, required: true, default: false },
    grantedReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

export const SubscriptionModel: Model<SubscriptionAttrs> = model<SubscriptionAttrs>(
  'Subscription',
  subscriptionSchema,
);
