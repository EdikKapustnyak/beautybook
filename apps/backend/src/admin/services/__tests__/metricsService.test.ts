// apps/backend/src/admin/services/__tests__/metricsService.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/billing/adapters.js', () => ({
  mongoSubscriptionRepositoryPort: { listByStatus: vi.fn() },
  mongoPlanConfigRepositoryPort: { listAll: vi.fn() },
}));

import {
  mongoPlanConfigRepositoryPort,
  mongoSubscriptionRepositoryPort,
} from '../../../shared/billing/adapters.js';
import { computeEstimatedMrr } from '../metricsService.js';

const STARTER_CONFIG = {
  plan: 'starter' as const,
  displayName: 'Starter',
  priceAmount: 50000, // 500.00 NOK in minor units
  currency: 'NOK',
  discountPercent: 0,
  stripePriceId: 'price_starter',
  active: true,
};
const BUSINESS_CONFIG = {
  ...STARTER_CONFIG,
  plan: 'business' as const,
  priceAmount: 150000,
  discountPercent: 10,
  stripePriceId: 'price_business',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeEstimatedMrr', () => {
  it('sums priceAmount across active subscriptions, grouped by plan', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listByStatus).mockResolvedValue([
      { plan: 'starter' } as never,
      { plan: 'starter' } as never,
      { plan: 'business' } as never,
    ]);
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([
      STARTER_CONFIG,
      BUSINESS_CONFIG,
    ]);

    const result = await computeEstimatedMrr();

    expect(result.totalActiveSubscriptions).toBe(3);
    expect(result.byPlan).toEqual(
      expect.arrayContaining([
        { plan: 'starter', activeSubscriptions: 2, estimatedMrr: 100000 },
        { plan: 'business', activeSubscriptions: 1, estimatedMrr: 135000 }, // 150000 * 0.9
      ]),
    );
    expect(result.totalEstimatedMrr).toBe(100000 + 135000);
    expect(result.currency).toBe('NOK');
  });

  it('applies discountPercent when computing the per-seat price', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listByStatus).mockResolvedValue([
      { plan: 'business' } as never,
    ]);
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([BUSINESS_CONFIG]);

    const result = await computeEstimatedMrr();

    expect(result.byPlan[0]?.estimatedMrr).toBe(135000);
  });

  it('returns zero MRR with no active subscriptions', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listByStatus).mockResolvedValue([]);
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([STARTER_CONFIG]);

    const result = await computeEstimatedMrr();

    expect(result.totalEstimatedMrr).toBe(0);
    expect(result.totalActiveSubscriptions).toBe(0);
    expect(result.byPlan).toEqual([]);
  });

  it('treats a subscription on a plan with no PlanConfig row as 0 (never throws)', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listByStatus).mockResolvedValue([
      { plan: 'starter' } as never,
    ]);
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([]);

    const result = await computeEstimatedMrr();

    expect(result.byPlan).toEqual([{ plan: 'starter', activeSubscriptions: 1, estimatedMrr: 0 }]);
  });
});
