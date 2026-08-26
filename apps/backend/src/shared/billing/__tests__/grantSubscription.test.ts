import { describe, expect, it } from 'vitest';

import { grantSubscription } from '../grantSubscription.js';
import type {
  CompanyExistsPort,
  SubscriptionRecord,
  SubscriptionRepositoryPort,
} from '../types.js';

function buildInMemorySubscriptionRepo(): SubscriptionRepositoryPort {
  const byCompanyId = new Map<string, SubscriptionRecord>();
  let counter = 0;
  return {
    async findByCompanyId(companyId) {
      return byCompanyId.get(companyId) ?? null;
    },
    async findByStripeCustomerId() {
      return null;
    },
    async create(data) {
      const record: SubscriptionRecord = {
        id: `sub_${++counter}`,
        status: 'incomplete',
        cancelAtPeriodEnd: false,
        grantedByAdmin: false,
        ...data,
      };
      byCompanyId.set(data.companyId, record);
      return record;
    },
    async updateByCompanyId(companyId, updates) {
      const existing = byCompanyId.get(companyId);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      byCompanyId.set(companyId, updated);
      return updated;
    },
    async updateByStripeCustomerId() {
      return null;
    },
    async listByStatus(status) {
      return [...byCompanyId.values()].filter((s) => s.status === status);
    },
    async listAll(options) {
      const all = [...byCompanyId.values()];
      const start = (options.page - 1) * options.limit;
      return { items: all.slice(start, start + options.limit), total: all.length };
    },
  };
}

function buildCompanyExists(existingIds: string[]): CompanyExistsPort {
  const set = new Set(existingIds);
  return {
    async exists(companyId) {
      return set.has(companyId);
    },
  };
}

describe('grantSubscription', () => {
  it('creates a new, active, admin-granted subscription for a company with none yet', async () => {
    const subscriptionRepo = buildInMemorySubscriptionRepo();
    const companyExists = buildCompanyExists(['company-1']);

    const result = await grantSubscription(
      { subscriptionRepo, companyExists },
      { companyId: 'company-1', plan: 'business', reason: 'partner deal' },
    );

    expect(result).toMatchObject({
      companyId: 'company-1',
      plan: 'business',
      status: 'active',
      grantedByAdmin: true,
      grantedReason: 'partner deal',
    });
  });

  it('overwrites an EXISTING subscription (e.g. a real Stripe one) when granted', async () => {
    const subscriptionRepo = buildInMemorySubscriptionRepo();
    const companyExists = buildCompanyExists(['company-1']);
    await subscriptionRepo.create({
      companyId: 'company-1',
      plan: 'starter',
      stripeCustomerId: 'cus_real123',
      status: 'past_due',
    });

    const result = await grantSubscription(
      { subscriptionRepo, companyExists },
      { companyId: 'company-1', plan: 'business' },
    );

    expect(result.plan).toBe('business');
    expect(result.status).toBe('active');
    expect(result.grantedByAdmin).toBe(true);
    // Real Stripe linkage is left untouched — only status/plan/provenance change.
    expect(result.stripeCustomerId).toBe('cus_real123');
  });

  it('throws NotFoundError for a company that does not exist', async () => {
    const subscriptionRepo = buildInMemorySubscriptionRepo();
    const companyExists = buildCompanyExists([]);

    await expect(
      grantSubscription(
        { subscriptionRepo, companyExists },
        { companyId: 'does-not-exist', plan: 'starter' },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('works without a reason (optional field)', async () => {
    const subscriptionRepo = buildInMemorySubscriptionRepo();
    const companyExists = buildCompanyExists(['company-1']);

    const result = await grantSubscription(
      { subscriptionRepo, companyExists },
      { companyId: 'company-1', plan: 'starter' },
    );

    expect(result.grantedReason).toBeUndefined();
  });
});
