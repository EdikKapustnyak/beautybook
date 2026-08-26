// apps/backend/src/tenant/services/subscriptionService.ts
//
// dev-tasks.md §21 / technical-spec.md §14 / security-measures.md §20.
//
// Flow (project-overview.md §20, adapted — see the ASSUMPTION note
// below): owner picks a plan -> createCheckoutSession -> Stripe Checkout
// -> owner pays -> Stripe sends a signed webhook -> handleWebhookEvent
// verifies the signature and updates the LOCAL Subscription mirror.
// Stripe is the source of truth for payment state; nothing in this file
// ever sets `status`/`currentPeriod*` from anything other than a
// verified webhook payload.
//
// ASSUMPTION (explicit scope decision, matching this project's own
// documented style for such calls): project-overview.md §20 describes
// company+owner creation happening AFTER payment succeeds, as part of
// the webhook. This codebase's actual, already-shipped registration flow
// (authService.registerCompanyAndOwner) creates the company+owner
// immediately at signup, with no payment gate — settled in an earlier
// session, not reopened here. Stripe subscriptions are therefore
// implemented as an ADD-ON an already-registered, already-logged-in
// owner purchases for their existing company, not a signup-blocking
// step. Company.status stays platform-admin-only
// (CompanyRepositoryPort.updateById's own doc comment: "status changes
// are platform-admin-only, never a generic profile PATCH"). Gating
// tenant features on subscription.status (dev-tasks.md §21's "Feature
// gates" checklist item) is a separate building block — see
// tenant/middleware/requireActiveSubscription.ts — not wired into any
// existing route by this file. Manually granting a subscription (comped
// accounts, partner deals) is a platform-admin action and therefore
// lives in shared/billing/grantSubscription.ts, not here — see that
// file's header for why (eslint.config.js forbids admin/** from
// importing tenant/**, so admin-only logic can't live in tenant/services/).

import { NotFoundError, UnauthorizedError } from '../../shared/errors/AppError.js';
import type { StripeGatewayPort, StripeWebhookEvent } from '../../shared/payments/stripeGateway.js';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../shared/billing/subscription.model.js';
import type {
  PlanConfigRepositoryPort,
  StripeEventLedgerPort,
  SubscriptionRecord,
  SubscriptionRepositoryPort,
} from '../../shared/billing/types.js';
import type { CompanyRepositoryPort } from '../repositories/types.js';
import type { SubscriptionNotifierPort } from './subscriptionNotifier.js';

export interface SubscriptionServiceDeps {
  companyRepo: CompanyRepositoryPort;
  subscriptionRepo: SubscriptionRepositoryPort;
  planConfigRepo: PlanConfigRepositoryPort;
  eventLedger: StripeEventLedgerPort;
  stripeGateway: StripeGatewayPort;
  notifier: SubscriptionNotifierPort;
  /**
   * ONLY used to bootstrap a PlanConfig row the very first time a plan
   * is read and no admin-managed row exists yet (see
   * planConfigRepository.ts's findOrSeedByPlan) — every subsequent read
   * comes from the database, which a platform admin can then edit
   * (admin/controllers/planConfigController.ts) without touching env
   * vars or redeploying.
   */
  planConfigSeedDefaults: Record<
    SubscriptionPlan,
    { displayName: string; priceAmount: number; currency: string; stripePriceId: string }
  >;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
  billingPortalReturnUrl: string;
}

/** Structural shape this file actually reads off a Stripe Checkout Session object. */
interface StripeCheckoutSessionObject {
  customer: string | null;
  subscription: string | null;
}

/** Structural shape this file actually reads off a Stripe Subscription object. */
interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

/** Structural shape this file actually reads off a Stripe Invoice object. */
interface StripeInvoiceObject {
  customer: string;
}

export function createSubscriptionService(deps: SubscriptionServiceDeps) {
  const {
    companyRepo,
    subscriptionRepo,
    planConfigRepo,
    eventLedger,
    stripeGateway,
    notifier,
    planConfigSeedDefaults,
    checkoutSuccessUrl,
    checkoutCancelUrl,
    billingPortalReturnUrl,
  } = deps;

  return {
    async getSubscription(companyId: string): Promise<SubscriptionRecord | null> {
      return subscriptionRepo.findByCompanyId(companyId);
    },

    /**
     * Idempotent from the caller's perspective: safe to call again if an
     * earlier attempt was abandoned (owner closed the Checkout tab) or
     * even to switch plan before ever completing payment — the local
     * Subscription row's `plan` field is the one BeautyBook writes
     * pre-payment; everything else on it stays untouched until Stripe's
     * webhook confirms the actual payment outcome.
     */
    async createCheckoutSession(input: {
      companyId: string;
      plan: SubscriptionPlan;
      requesterEmail: string;
      requesterName: string;
    }): Promise<{ url: string }> {
      const company = await companyRepo.findById(input.companyId);
      if (!company) {
        throw new NotFoundError('Company not found.');
      }

      const planConfig = await planConfigRepo.findOrSeedByPlan(
        input.plan,
        planConfigSeedDefaults[input.plan],
      );

      const { stripeCustomerId } = await stripeGateway.findOrCreateCustomer({
        companyId: input.companyId,
        email: input.requesterEmail,
        name: input.requesterName,
      });

      const existing = await subscriptionRepo.findByCompanyId(input.companyId);
      if (!existing) {
        await subscriptionRepo.create({
          companyId: input.companyId,
          stripeCustomerId,
          plan: input.plan,
        });
      } else if (existing.plan !== input.plan) {
        await subscriptionRepo.updateByCompanyId(input.companyId, { plan: input.plan });
      }

      let discountCouponId: string | undefined;
      if (planConfig.discountPercent > 0) {
        const coupon = await stripeGateway.findOrCreatePercentOffCoupon(planConfig.discountPercent);
        discountCouponId = coupon.stripeCouponId;
      }

      return stripeGateway.createCheckoutSession({
        stripeCustomerId,
        priceId: planConfig.stripePriceId,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
        companyId: input.companyId,
        discountCouponId,
      });
    },

    /**
     * Stripe's own hosted page for changing payment method, viewing
     * invoices, and self-service cancellation — see
     * StripeGatewayPort.createBillingPortalSession's doc comment.
     */
    async createBillingPortalSession(companyId: string): Promise<{ url: string }> {
      const subscription = await subscriptionRepo.findByCompanyId(companyId);
      if (!subscription) {
        throw new NotFoundError('This company has no subscription yet.');
      }
      if (!subscription.stripeCustomerId) {
        // Admin-granted (comped) subscriptions have no real Stripe
        // Customer behind them — there's no card to update and nothing
        // to cancel via Stripe's portal. Surfaced as NotFound (same
        // shape as "no subscription at all") rather than a confusing
        // silent redirect.
        throw new NotFoundError('This subscription is not managed through Stripe.');
      }
      return stripeGateway.createBillingPortalSession({
        stripeCustomerId: subscription.stripeCustomerId,
        returnUrl: billingPortalReturnUrl,
      });
    },

    /**
     * Verifies the signature, dedupes via the ledger, and dispatches to a
     * per-event-type handler. Always resolves (never throws) for a
     * VALID, already-verified event — even one this codebase doesn't
     * specifically handle (see the `default` case below) — so the
     * caller (stripeWebhookController.ts) can always respond 200 and
     * stop Stripe from retrying. Throws ONLY for a bad signature, which
     * the controller turns into a 400 without recording anything in the
     * ledger (an unverified payload was never "processed").
     */
    async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
      let event: StripeWebhookEvent;
      try {
        event = stripeGateway.constructWebhookEvent(rawBody, signature);
      } catch {
        throw new UnauthorizedError('Invalid Stripe webhook signature.');
      }

      const isNewEvent = await eventLedger.recordIfNew(event.id, event.type);
      if (!isNewEvent) {
        // Replay of an event we've already handled — Stripe's "at least
        // once" delivery, security-measures.md §20's dedup requirement.
        // Deliberately silent: this is the expected, common case for a
        // provider retry, not a warning-worthy anomaly.
        return;
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as unknown as StripeCheckoutSessionObject;
          if (!session.customer || !session.subscription) {
            // Defensive: this codebase always creates Checkout Sessions
            // in `mode: 'subscription'` with a Customer attached — a
            // session missing either would indicate a Stripe Dashboard
            // configuration this service doesn't support, not a bug in
            // this handler. Recorded in the ledger already; nothing more
            // to do.
            break;
          }
          await subscriptionRepo.updateByStripeCustomerId(session.customer, {
            stripeSubscriptionId: session.subscription,
          });
          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as unknown as StripeSubscriptionObject;
          await subscriptionRepo.updateByStripeCustomerId(sub.customer, {
            stripeSubscriptionId: sub.id,
            status:
              event.type === 'customer.subscription.deleted'
                ? ('canceled' as SubscriptionStatus)
                : (sub.status as SubscriptionStatus),
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as unknown as StripeInvoiceObject;
          const subscription = await subscriptionRepo.findByStripeCustomerId(invoice.customer);
          if (!subscription) break; // defensive — see checkout.session.completed's comment above
          const company = await companyRepo.findById(subscription.companyId);
          if (!company) break;
          await notifier.notifyOwnerPaymentFailed({
            companyId: subscription.companyId,
            companyName: company.name,
          });
          // Deliberately does NOT set status here — Stripe follows this
          // event with `customer.subscription.updated` (status:
          // 'past_due'), which is the actual, structured source of
          // truth for status. This handler's only job is the
          // owner-facing notification.
          break;
        }

        default:
          // Any other event type — already recorded in the ledger above,
          // so Stripe won't keep retrying it.
          break;
      }
    },
  };
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>;
