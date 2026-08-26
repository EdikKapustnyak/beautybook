// apps/backend/src/shared/payments/stripeGateway.ts
//
// A narrow port over the Stripe SDK — subscriptionService.ts depends on
// this interface, never on the `stripe` package directly, so its webhook
// and checkout-creation logic can be unit-tested with an in-memory fake
// (tenant/services/__tests__/inMemoryPorts.ts) instead of hitting Stripe's
// real API or fighting the SDK's own network layer in tests. Same
// dependency-injection shape as CompanyRepositoryPort/UserRepositoryPort
// in tenant/repositories/types.ts.
//
// Deliberately minimal: only the 3 Stripe operations this codebase
// actually needs (find-or-create Customer, create a Checkout Session,
// verify+parse a webhook payload) — not a full Stripe API surface.

export interface StripeCheckoutSessionInput {
  stripeCustomerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Stripe Checkout metadata — lets the webhook handler recover
   * companyId even if, for any reason, the Customer <-> company mapping
   * were ever ambiguous. Defense in depth, not the primary lookup path
   * (which is stripeCustomerId on the Subscription document). */
  companyId: string;
  /** Set when the plan's admin-configured PlanConfig.discountPercent > 0 — see subscriptionService.ts. */
  discountCouponId?: string;
}

/**
 * Structurally compatible with (a subset of) Stripe.Event — deliberately
 * NOT importing the `Stripe` namespace here, so this file (and anything
 * that only needs to read already-verified event data, like
 * subscriptionService.ts) has zero compile-time dependency on the
 * `stripe` package itself. Only stripeGateway.instance.ts touches the
 * real SDK types.
 */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface StripeGatewayPort {
  /**
   * Looks up an existing Stripe Customer for this company (by
   * `companyId` in the Customer's own metadata) or creates a new one.
   * Idempotent from the caller's perspective — safe to call on every
   * checkout attempt, including retries after an earlier failed one.
   */
  findOrCreateCustomer(input: { companyId: string; email: string; name: string }): Promise<{
    stripeCustomerId: string;
  }>;

  createCheckoutSession(input: StripeCheckoutSessionInput): Promise<{ url: string }>;

  /**
   * Stripe's own self-service page for changing payment method,
   * updating billing details, viewing invoices, and cancelling — Stripe
   * hosts the whole flow, this codebase never touches card data
   * directly (security-measures.md §10's file-upload MIME/magic-byte
   * discipline has a billing analogue: never build a "collect card
   * details" form ourselves when Stripe already provides a compliant
   * one).
   */
  createBillingPortalSession(input: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;

  /**
   * Finds an existing percent-off Coupon for this exact percentage or
   * creates one — Stripe Coupons are immutable and shared across
   * customers, so this is safe to call repeatedly with the same
   * percentage (idempotent from the caller's perspective, same
   * "find-or-create" shape as findOrCreateCustomer above).
   */
  findOrCreatePercentOffCoupon(percent: number): Promise<{ stripeCouponId: string }>;

  /**
   * Creates a real, redeemable Stripe Coupon + PromotionCode pair —
   * unlike findOrCreatePercentOffCoupon above (an internal, automatic
   * per-plan discount applied silently at checkout), a Promotion Code is
   * a CODE the customer types in themselves. Checkout Sessions this
   * codebase creates always set `allow_promotion_codes: true`
   * (createCheckoutSession below), so any code created here becomes
   * immediately usable in Stripe's own hosted Checkout UI — no custom
   * validation/redemption logic needs to be built on this side.
   */
  createPromotionCode(input: {
    code: string;
    percentOff: number;
    maxRedemptions?: number;
    expiresAt?: Date;
  }): Promise<{ stripeCouponId: string; stripePromotionCodeId: string }>;

  /**
   * Verifies the cryptographic signature against the RAW request body
   * (security-measures.md §20) and returns the parsed event. Throws if
   * the signature is missing or invalid — the caller (stripeWebhookController)
   * must respond 400 without processing anything, never fall back to
   * trusting an unverified payload.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): StripeWebhookEvent;
}
