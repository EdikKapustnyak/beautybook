// apps/backend/src/tenant/models/stripeWebhookEvent.model.ts
//
// Idempotency ledger for Stripe webhook events — same pattern as
// Notification.dedupeKey (notification.model.ts): a unique index is what
// makes a retried/duplicate delivery safe. Stripe explicitly delivers
// "at least once" and recommends deduping by event.id
// (security-measures.md §20: "Нужен event ID deduplication либо полностью
// идемпотентные state-setting handlers" — this codebase does both: the
// ledger below for defense in depth, AND subscriptionService.ts's own
// handlers are individually idempotent no-ops on a replay).
//
// Deliberately its own tiny collection rather than reusing Notification —
// a processed Stripe event isn't a notification, and giving it a
// dedicated model keeps the unique index's meaning (one row per Stripe
// event) unambiguous.

import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface StripeWebhookEventAttrs {
  /** Stripe's own event id (`evt_...`) — globally unique per Stripe. */
  stripeEventId: string;
  type: string;
  processedAt: Date;
}

export type StripeWebhookEventDocument = HydratedDocument<StripeWebhookEventAttrs>;

const stripeWebhookEventSchema = new Schema<StripeWebhookEventAttrs>({
  stripeEventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  processedAt: { type: Date, required: true, default: () => new Date() },
});

export const StripeWebhookEventModel: Model<StripeWebhookEventAttrs> =
  model<StripeWebhookEventAttrs>('StripeWebhookEvent', stripeWebhookEventSchema);
