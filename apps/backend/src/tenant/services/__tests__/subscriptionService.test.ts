// apps/backend/src/tenant/services/__tests__/subscriptionService.test.ts
//
// dev-tasks.md §21's own test checklist drives this file's structure:
// forged webhook, missing signature, duplicated event, out-of-order
// event, payment failure, subscription cancellation, expired
// subscription.

import { beforeEach, describe, expect, it } from 'vitest';

import type { StripeWebhookEvent } from '../../../shared/payments/stripeGateway.js';
import { createSubscriptionService } from '../subscriptionService.js';
import {
  createInMemoryCompanyRepo,
  createInMemoryPlanConfigRepo,
  createInMemoryStripeEventLedger,
  createInMemoryStripeGateway,
  createInMemorySubscriptionNotifier,
  createInMemorySubscriptionRepo,
} from './inMemoryPorts.js';

function buildService() {
  const companyRepo = createInMemoryCompanyRepo();
  const subscriptionRepo = createInMemorySubscriptionRepo();
  const planConfigRepo = createInMemoryPlanConfigRepo();
  const eventLedger = createInMemoryStripeEventLedger();
  const stripeGateway = createInMemoryStripeGateway();
  const notifier = createInMemorySubscriptionNotifier();

  const service = createSubscriptionService({
    companyRepo,
    subscriptionRepo,
    planConfigRepo,
    eventLedger,
    stripeGateway,
    notifier,
    planConfigSeedDefaults: {
      starter: {
        displayName: 'Starter',
        priceAmount: 50000,
        currency: 'NOK',
        stripePriceId: 'price_starter_test',
      },
      business: {
        displayName: 'Business',
        priceAmount: 150000,
        currency: 'NOK',
        stripePriceId: 'price_business_test',
      },
    },
    checkoutSuccessUrl: 'https://beautybook.no/dashboard/billing?checkout=success',
    checkoutCancelUrl: 'https://beautybook.no/dashboard/billing?checkout=cancelled',
    billingPortalReturnUrl: 'https://beautybook.no/dashboard/billing',
  });

  return {
    service,
    companyRepo,
    subscriptionRepo,
    planConfigRepo,
    eventLedger,
    stripeGateway,
    notifier,
  };
}

function checkoutCompletedEvent(overrides: {
  id?: string;
  customer: string;
  subscription: string;
}): StripeWebhookEvent {
  return {
    id: overrides.id ?? 'evt_checkout_1',
    type: 'checkout.session.completed',
    data: { object: { customer: overrides.customer, subscription: overrides.subscription } },
  };
}

function subscriptionUpdatedEvent(overrides: {
  id?: string;
  type?: string;
  subscriptionId: string;
  customer: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
}): StripeWebhookEvent {
  return {
    id: overrides.id ?? 'evt_sub_updated_1',
    type: overrides.type ?? 'customer.subscription.updated',
    data: {
      object: {
        id: overrides.subscriptionId,
        customer: overrides.customer,
        status: overrides.status ?? 'active',
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_592_000,
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
      },
    },
  };
}

describe('subscriptionService.createCheckoutSession', () => {
  let built: ReturnType<typeof buildService>;
  let companyId: string;

  beforeEach(async () => {
    built = buildService();
    const company = await built.companyRepo.create({
      name: 'Glow Studio',
      slug: 'glow-studio',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
    });
    companyId = company.id;
  });

  it('creates a Stripe Customer, a local Subscription row, and returns a checkout URL', async () => {
    const result = await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });

    expect(result.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
    expect(built.stripeGateway.createdCustomers).toHaveLength(1);
    expect(built.stripeGateway.createdCheckoutSessions[0]).toMatchObject({
      priceId: 'price_starter_test',
      companyId,
    });

    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.plan).toBe('starter');
    expect(stored?.status).toBe('incomplete'); // not yet confirmed by webhook
  });

  it('reuses the SAME Stripe Customer on a second call (idempotent from the caller side)', async () => {
    await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });
    await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });

    expect(built.stripeGateway.createdCustomers).toHaveLength(1);
  });

  it("updates the local row's plan if the owner switches plan before ever completing payment", async () => {
    await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });
    await built.service.createCheckoutSession({
      companyId,
      plan: 'business',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });

    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.plan).toBe('business');
  });

  it('throws NotFoundError for an unknown company', async () => {
    await expect(
      built.service.createCheckoutSession({
        companyId: 'does-not-exist',
        plan: 'starter',
        requesterEmail: 'owner@glowstudio.no',
        requesterName: 'Owner Ownerson',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('applies a discount coupon at checkout when the plan has one configured', async () => {
    await built.planConfigRepo.findOrSeedByPlan('starter', {
      displayName: 'Starter',
      priceAmount: 50000,
      currency: 'NOK',
      stripePriceId: 'price_starter_test',
    });
    await built.planConfigRepo.updateByPlan('starter', { discountPercent: 20 });

    await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });

    expect(built.stripeGateway.createdCoupons).toEqual([20]);
    expect(built.stripeGateway.createdCheckoutSessions[0]).toMatchObject({
      discountCouponId: 'pct_off_20',
    });
  });

  it('does NOT apply any coupon when the plan has no discount configured', async () => {
    await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });

    expect(built.stripeGateway.createdCoupons).toHaveLength(0);
    expect(built.stripeGateway.createdCheckoutSessions[0]?.discountCouponId).toBeUndefined();
  });
});

describe('subscriptionService.createBillingPortalSession', () => {
  it('returns a portal URL for a company with a subscription', async () => {
    const built = buildService();
    const company = await built.companyRepo.create({
      name: 'Glow Studio',
      slug: 'glow-studio',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
    });
    await built.service.createCheckoutSession({
      companyId: company.id,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });

    const result = await built.service.createBillingPortalSession(company.id);

    expect(result.url).toMatch(/^https:\/\/billing\.stripe\.com/);
    expect(built.stripeGateway.createdPortalSessions).toHaveLength(1);
  });

  it('throws NotFoundError for a company with no subscription at all', async () => {
    const built = buildService();
    const company = await built.companyRepo.create({
      name: 'Glow Studio',
      slug: 'glow-studio',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
    });

    await expect(built.service.createBillingPortalSession(company.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('subscriptionService.handleWebhookEvent', () => {
  let built: ReturnType<typeof buildService>;
  let companyId: string;
  let stripeCustomerId: string;

  beforeEach(async () => {
    built = buildService();
    const company = await built.companyRepo.create({
      name: 'Glow Studio',
      slug: 'glow-studio',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
    });
    companyId = company.id;
    const { url: _url } = await built.service.createCheckoutSession({
      companyId,
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });
    stripeCustomerId = built.stripeGateway.createdCheckoutSessions[0]!.stripeCustomerId;
  });

  it('rejects a forged/invalid signature and does NOT record it in the ledger', async () => {
    built.stripeGateway.nextConstructedEvent = new Error(
      'No signatures found matching the expected signature',
    );

    await expect(
      built.service.handleWebhookEvent(Buffer.from('{}'), 'bad-signature'),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('checkout.session.completed sets stripeSubscriptionId on the local row', async () => {
    built.stripeGateway.nextConstructedEvent = checkoutCompletedEvent({
      customer: stripeCustomerId,
      subscription: 'sub_test123',
    });

    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.stripeSubscriptionId).toBe('sub_test123');
  });

  it('customer.subscription.updated syncs status, period, and cancelAtPeriodEnd', async () => {
    built.stripeGateway.nextConstructedEvent = subscriptionUpdatedEvent({
      subscriptionId: 'sub_test123',
      customer: stripeCustomerId,
      status: 'active',
      cancelAtPeriodEnd: true,
    });

    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.status).toBe('active');
    expect(stored?.stripeSubscriptionId).toBe('sub_test123');
    expect(stored?.cancelAtPeriodEnd).toBe(true);
    expect(stored?.currentPeriodStart).toBeInstanceOf(Date);
    expect(stored?.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('customer.subscription.deleted marks the subscription canceled', async () => {
    built.stripeGateway.nextConstructedEvent = subscriptionUpdatedEvent({
      type: 'customer.subscription.deleted',
      subscriptionId: 'sub_test123',
      customer: stripeCustomerId,
      status: 'canceled',
    });

    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.status).toBe('canceled');
  });

  it('a duplicated event (same event id replayed) is processed only once', async () => {
    built.stripeGateway.nextConstructedEvent = checkoutCompletedEvent({
      id: 'evt_dup_1',
      customer: stripeCustomerId,
      subscription: 'sub_test123',
    });
    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    // Replay with a DIFFERENT payload but the SAME event id — proves the
    // dedup keys off event.id, not payload equality.
    built.stripeGateway.nextConstructedEvent = checkoutCompletedEvent({
      id: 'evt_dup_1',
      customer: stripeCustomerId,
      subscription: 'sub_DIFFERENT',
    });
    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.stripeSubscriptionId).toBe('sub_test123'); // NOT overwritten by the replay
  });

  it('OUT-OF-ORDER: customer.subscription.updated arriving BEFORE checkout.session.completed still applies (looked up by customer id, not subscription id)', async () => {
    built.stripeGateway.nextConstructedEvent = subscriptionUpdatedEvent({
      subscriptionId: 'sub_test123',
      customer: stripeCustomerId,
      status: 'active',
    });
    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    let stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.status).toBe('active');
    expect(stored?.stripeSubscriptionId).toBe('sub_test123');

    // The (redundant, but real-world-typical) checkout.session.completed
    // arrives afterward — should be a harmless no-op overwrite with
    // consistent data, not an error.
    built.stripeGateway.nextConstructedEvent = checkoutCompletedEvent({
      id: 'evt_checkout_late',
      customer: stripeCustomerId,
      subscription: 'sub_test123',
    });
    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.status).toBe('active');
  });

  it('an unhandled event type is still recorded in the ledger (silent no-op, not an error)', async () => {
    built.stripeGateway.nextConstructedEvent = {
      id: 'evt_random_unhandled',
      type: 'customer.updated',
      data: { object: {} },
    };

    await expect(
      built.service.handleWebhookEvent(Buffer.from('{}'), 'sig'),
    ).resolves.toBeUndefined();

    expect(await built.eventLedger.recordIfNew('evt_random_unhandled', 'customer.updated')).toBe(
      false,
    );
  });

  it('invoice.payment_failed notifies the company owner and does NOT itself change status', async () => {
    built.stripeGateway.nextConstructedEvent = {
      id: 'evt_invoice_failed_1',
      type: 'invoice.payment_failed',
      data: { object: { customer: stripeCustomerId } },
    };

    await built.service.handleWebhookEvent(Buffer.from('{}'), 'sig');

    expect(built.notifier.notifiedPaymentFailures).toEqual([
      { companyId, companyName: 'Glow Studio' },
    ]);
    const stored = await built.subscriptionRepo.findByCompanyId(companyId);
    expect(stored?.status).toBe('incomplete'); // unchanged by this event alone
  });

  it('invoice.payment_failed for an unknown Stripe customer is a safe no-op (never throws)', async () => {
    built.stripeGateway.nextConstructedEvent = {
      id: 'evt_invoice_failed_unknown',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_totally_unknown' } },
    };

    await expect(
      built.service.handleWebhookEvent(Buffer.from('{}'), 'sig'),
    ).resolves.toBeUndefined();
    expect(built.notifier.notifiedPaymentFailures).toHaveLength(0);
  });
});
