// apps/backend/src/tenant/routes/subscriptionRoutes.ts
//
// dev-tasks.md §21. `checkout` is owner/admin only (initiating a paid
// subscription is a billing action, same authorization bar as PATCH
// /company) — the Stripe webhook that actually confirms payment is a
// SEPARATE, unauthenticated-but-signature-verified route mounted
// directly on the app (see app.ts + stripeWebhookController.ts), not
// here.

import { Router } from 'express';

import {
  createCheckoutSession,
  createBillingPortalSession,
  getSubscription,
} from '../controllers/subscriptionController.js';
import { requireFreshAuth } from '../middleware/requireFreshAuth.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const subscriptionRouter: Router = Router();

subscriptionRouter.get('/', requireTenantAuth, getSubscription);
subscriptionRouter.post(
  '/checkout',
  requireTenantAuth,
  requireTenantRole('owner', 'admin'),
  createCheckoutSession,
);
// Self-service payment-method changes and cancellation — Stripe's hosted
// page. Step-up auth (requireFreshAuth) since this grants access to
// cancel billing entirely, same bar as the checkout route above.
subscriptionRouter.post(
  '/portal',
  requireTenantAuth,
  requireTenantRole('owner', 'admin'),
  requireFreshAuth,
  createBillingPortalSession,
);
