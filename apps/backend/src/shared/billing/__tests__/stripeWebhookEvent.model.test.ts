import { describe, expect, it } from 'vitest';

import { StripeWebhookEventModel } from '../stripeWebhookEvent.model.js';

describe('StripeWebhookEventModel validation', () => {
  it('accepts a well-formed record', () => {
    const doc = new StripeWebhookEventModel({
      stripeEventId: 'evt_test123',
      type: 'checkout.session.completed',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults processedAt to now', () => {
    const before = Date.now();
    const doc = new StripeWebhookEventModel({
      stripeEventId: 'evt_test123',
      type: 'checkout.session.completed',
    });
    expect(doc.processedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rejects a missing stripeEventId', () => {
    const doc = new StripeWebhookEventModel({ type: 'checkout.session.completed' });
    expect(doc.validateSync()?.errors.stripeEventId).toBeDefined();
  });

  it('rejects a missing type', () => {
    const doc = new StripeWebhookEventModel({ stripeEventId: 'evt_test123' });
    expect(doc.validateSync()?.errors.type).toBeDefined();
  });
});
