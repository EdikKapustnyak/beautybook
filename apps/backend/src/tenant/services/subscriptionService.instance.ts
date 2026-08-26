// apps/backend/src/tenant/services/subscriptionService.instance.ts

import { env } from '../../config/env.js';
import { stripeGateway } from '../../shared/payments/stripeGateway.instance.js';
import { mongoCompanyRepositoryPort } from '../repositories/authRepositoryAdapters.js';
import {
  mongoPlanConfigRepositoryPort,
  mongoStripeEventLedgerPort,
  mongoSubscriptionRepositoryPort,
} from '../../shared/billing/adapters.js';
import { subscriptionNotifier } from './subscriptionNotifier.instance.js';
import { createSubscriptionService } from './subscriptionService.js';

// priceAmount is deliberately 0 here — these are only ever used as a
// ONE-TIME seed if no admin-managed PlanConfig row exists yet (see
// planConfigRepository.ts's findOrSeedByPlan). A platform admin sets the
// real informational display price (and everything else) via
// admin/controllers/planConfigController.ts immediately after first
// deploy; env vars only ever need to carry the real Stripe Price id.
export const subscriptionService = createSubscriptionService({
  companyRepo: mongoCompanyRepositoryPort,
  subscriptionRepo: mongoSubscriptionRepositoryPort,
  planConfigRepo: mongoPlanConfigRepositoryPort,
  eventLedger: mongoStripeEventLedgerPort,
  stripeGateway,
  notifier: subscriptionNotifier,
  planConfigSeedDefaults: {
    starter: {
      displayName: 'Starter',
      priceAmount: 0,
      currency: 'NOK',
      stripePriceId: env.STRIPE_PRICE_ID_STARTER,
    },
    business: {
      displayName: 'Business',
      priceAmount: 0,
      currency: 'NOK',
      stripePriceId: env.STRIPE_PRICE_ID_BUSINESS,
    },
  },
  checkoutSuccessUrl: env.STRIPE_CHECKOUT_SUCCESS_URL,
  checkoutCancelUrl: env.STRIPE_CHECKOUT_CANCEL_URL,
  billingPortalReturnUrl: env.STRIPE_CHECKOUT_SUCCESS_URL,
});
