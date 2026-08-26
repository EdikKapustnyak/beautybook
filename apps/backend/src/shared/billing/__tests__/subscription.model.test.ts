import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { SubscriptionModel } from '../subscription.model.js';

function buildValidSubscription(overrides: Record<string, unknown> = {}) {
  return new SubscriptionModel({
    companyId: new Types.ObjectId(),
    stripeCustomerId: 'cus_test123',
    plan: 'starter',
    ...overrides,
  });
}

describe('SubscriptionModel validation', () => {
  it('accepts a well-formed subscription', () => {
    const subscription = buildValidSubscription();
    expect(subscription.validateSync()).toBeUndefined();
  });

  it('defaults status to "incomplete", cancelAtPeriodEnd to false, and grantedByAdmin to false', () => {
    const subscription = buildValidSubscription();
    expect(subscription.status).toBe('incomplete');
    expect(subscription.cancelAtPeriodEnd).toBe(false);
    expect(subscription.grantedByAdmin).toBe(false);
  });

  it('rejects a missing companyId', () => {
    const subscription = buildValidSubscription({ companyId: undefined });
    expect(subscription.validateSync()?.errors.companyId).toBeDefined();
  });

  it('accepts a subscription with NO stripeCustomerId (admin-granted/comped)', () => {
    const subscription = buildValidSubscription({
      stripeCustomerId: undefined,
      grantedByAdmin: true,
    });
    expect(subscription.validateSync()).toBeUndefined();
  });

  it('rejects an invalid plan enum value', () => {
    const subscription = buildValidSubscription({ plan: 'enterprise-unlimited' });
    expect(subscription.validateSync()?.errors.plan).toBeDefined();
  });

  it('accepts every valid Stripe subscription status', () => {
    const statuses = [
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
    ];
    for (const status of statuses) {
      const subscription = buildValidSubscription({ status });
      expect(subscription.validateSync(), `status "${status}" should be accepted`).toBeUndefined();
    }
  });

  it('rejects an invalid status enum value', () => {
    const subscription = buildValidSubscription({ status: 'lifetime-free' });
    expect(subscription.validateSync()?.errors.status).toBeDefined();
  });
});
