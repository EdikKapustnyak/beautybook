// apps/backend/src/shared/payments/stripeGateway.instance.ts
//
// Real StripeGatewayPort implementation, wrapping the `stripe` npm
// package. The Stripe SDK constructor does no network I/O itself (unlike
// BullMQ's Queue — see shared/queue/queues.ts's lazy-Proxy comment for
// that contrast), so a plain memoized singleton is sufficient here; no
// Proxy trick needed.

import Stripe from 'stripe';

import { env } from '../../config/env.js';
import type { StripeGatewayPort, StripeWebhookEvent } from './stripeGateway.js';

let client: Stripe | undefined;
function getClient(): Stripe {
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export const stripeGateway: StripeGatewayPort = {
  async findOrCreateCustomer({ companyId, email, name }) {
    // Search by metadata.companyId rather than trusting a stored id on
    // our side first — this is the ONE place that lookup happens, so a
    // company can never accidentally end up with two Stripe Customers if
    // this is called twice before a Subscription document exists yet.
    const existing = await getClient().customers.search({
      query: `metadata['companyId']:'${companyId}'`,
      limit: 1,
    });
    if (existing.data[0]) {
      return { stripeCustomerId: existing.data[0].id };
    }

    const created = await getClient().customers.create({
      email,
      name,
      metadata: { companyId },
    });
    return { stripeCustomerId: created.id };
  },

  async createCheckoutSession({
    stripeCustomerId,
    priceId,
    successUrl,
    cancelUrl,
    companyId,
    discountCouponId,
  }) {
    const session = await getClient().checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      ...(discountCouponId
        ? { discounts: [{ coupon: discountCouponId }] }
        : // Mutually exclusive with `discounts` in the Stripe API — only
          // set when no automatic per-plan discount is already being
          // applied. Lets a customer type in one of the Promotion Codes
          // created via createPromotionCode below.
          { allow_promotion_codes: true }),
      // Belt-and-suspenders alongside the Customer's own metadata.companyId
      // — see StripeCheckoutSessionInput's doc comment.
      subscription_data: { metadata: { companyId } },
    });

    if (!session.url) {
      // Stripe's types mark `url` nullable but this only happens for
      // Checkout Sessions in modes this codebase never uses (e.g.
      // certain custom payment-method configurations) — surfacing this
      // as a hard failure here is correct: silently returning an empty
      // string would send the owner to a broken "Pay now" button.
      throw new Error('Stripe did not return a Checkout Session URL.');
    }
    return { url: session.url };
  },

  async createBillingPortalSession({ stripeCustomerId, returnUrl }) {
    const session = await getClient().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  },

  async findOrCreatePercentOffCoupon(percent) {
    // Deterministic, human-recognizable id (`pct_off_10`) instead of a
    // random one — makes "find" actually mean something on retry rather
    // than depending on a search/list call. Stripe rejects a duplicate
    // `id` on create with a 400, which is what "found" looks like here.
    const couponId = `pct_off_${percent}`;
    try {
      const existing = await getClient().coupons.retrieve(couponId);
      return { stripeCouponId: existing.id };
    } catch {
      const created = await getClient().coupons.create({
        id: couponId,
        percent_off: percent,
        duration: 'forever',
      });
      return { stripeCouponId: created.id };
    }
  },

  async createPromotionCode({ code, percentOff, maxRedemptions, expiresAt }) {
    // A fresh, single-purpose Coupon per code (not the shared
    // findOrCreatePercentOffCoupon pool above) — a Promotion Code's own
    // max-redemptions/expiry live on the PromotionCode object, but
    // Stripe still requires a backing Coupon, and reusing the shared
    // pct_off_N coupon here would let this code's redemptions bleed into
    // that pool's own usage tracking.
    const coupon = await getClient().coupons.create({
      percent_off: percentOff,
      duration: 'forever',
    });
    const promotionCode = await getClient().promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(expiresAt.getTime() / 1000) } : {}),
    });
    return { stripeCouponId: coupon.id, stripePromotionCodeId: promotionCode.id };
  },

  constructWebhookEvent(rawBody, signature): StripeWebhookEvent {
    // Throws Stripe.errors.StripeSignatureVerificationError on a
    // missing/invalid signature — stripeWebhookController.ts catches
    // this and responds 400 without processing anything
    // (security-measures.md §20: "отклоняет invalid/missing signature").
    const event = getClient().webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
    return event as unknown as StripeWebhookEvent;
  },
};
