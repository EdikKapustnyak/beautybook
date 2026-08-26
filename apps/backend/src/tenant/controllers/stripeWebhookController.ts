// apps/backend/src/tenant/controllers/stripeWebhookController.ts
//
// Mounted directly on the Express app (app.ts), NOT under tenantRouter —
// see app.ts's comment on why: this needs the RAW request body
// (express.raw(), not express.json()) for Stripe's signature
// verification, and it's a server-to-server callback, never a browser
// request, so it also carries no CORS wrapper.

import { UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { subscriptionService } from '../services/subscriptionService.instance.js';

export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    // Same treatment as an invalid signature — security-measures.md §20:
    // "отклоняет invalid/missing signature". Never falls through to
    // processing an unverified body.
    throw new UnauthorizedError('Missing Stripe-Signature header.');
  }

  // `req.body` is a raw Buffer here, not parsed JSON — guaranteed by
  // `express.raw({ type: 'application/json' })` on this route in
  // app.ts, mounted BEFORE the global `express.json()` middleware so
  // that middleware never touches this path.
  await subscriptionService.handleWebhookEvent(req.body as Buffer, signature);

  // Stripe only cares about the 2xx/non-2xx distinction to decide
  // whether to retry — no response body content is meaningful to it,
  // but returning something explicit is easier to read in Stripe's own
  // webhook delivery logs during troubleshooting.
  res.status(200).json({ received: true });
});
