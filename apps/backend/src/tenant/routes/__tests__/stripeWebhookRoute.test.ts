// apps/backend/src/tenant/routes/__tests__/stripeWebhookRoute.test.ts
//
// Proves the ONE thing unit tests of stripeWebhookController.ts alone
// cannot: that app.ts actually wires `/webhooks/stripe` with
// `express.raw()` BEFORE the global `express.json()` middleware, so the
// exact raw request bytes reach subscriptionService.handleWebhookEvent
// untouched — critical for Stripe signature verification
// (security-measures.md §20). A supertest request through the real,
// unmocked `createApp()` is the only way to catch a regression where
// someone accidentally moves this route after `express.json()` (which
// would silently replace the raw body with a parsed object and break
// signature verification in production, while any test that mocks
// createApp()/the controller directly would never notice).

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/subscriptionService.instance.js', () => ({
  subscriptionService: { handleWebhookEvent: vi.fn() },
}));

import { subscriptionService } from '../../services/subscriptionService.instance.js';
import { UnauthorizedError } from '../../../shared/errors/AppError.js';
import { createApp } from '../../../app.js';

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /webhooks/stripe — real app wiring', () => {
  it('passes the EXACT raw request body bytes through to the service, not a parsed/re-serialized copy', async () => {
    vi.mocked(subscriptionService.handleWebhookEvent).mockResolvedValue(undefined);
    // Deliberately includes whitespace/key-ordering that a JSON.parse ->
    // JSON.stringify round-trip would normalize away — if this test
    // still passes, the bytes genuinely went through unmodified.
    const rawPayload = '{ "id":  "evt_test123",   "type":"checkout.session.completed" }';

    const response = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=123,v1=fakesig')
      .send(rawPayload);

    expect(response.status).toBe(200);
    expect(subscriptionService.handleWebhookEvent).toHaveBeenCalledTimes(1);
    const [receivedBody, receivedSignature] = vi.mocked(subscriptionService.handleWebhookEvent).mock
      .calls[0]!;
    expect(Buffer.isBuffer(receivedBody)).toBe(true);
    expect((receivedBody as Buffer).toString('utf8')).toBe(rawPayload);
    expect(receivedSignature).toBe('t=123,v1=fakesig');
  });

  it('rejects a request with no Stripe-Signature header at the real HTTP layer', async () => {
    const response = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(401);
    expect(subscriptionService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('surfaces a service-level signature-verification failure as a 401, not a 200', async () => {
    vi.mocked(subscriptionService.handleWebhookEvent).mockRejectedValue(
      new UnauthorizedError('Invalid Stripe webhook signature.'),
    );

    const response = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 'forged')
      .send('{}');

    expect(response.status).toBe(401);
  });
});
