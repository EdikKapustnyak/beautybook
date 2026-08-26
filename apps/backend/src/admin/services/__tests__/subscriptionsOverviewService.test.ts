import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/billing/adapters.js', () => ({
  mongoSubscriptionRepositoryPort: { listByStatus: vi.fn(), listAll: vi.fn() },
  mongoPlanConfigRepositoryPort: { listAll: vi.fn() },
}));
vi.mock('../../repositories/companyAdminRepository.js', () => ({
  companyAdminRepository: { findById: vi.fn() },
}));

import {
  mongoPlanConfigRepositoryPort,
  mongoSubscriptionRepositoryPort,
} from '../../../shared/billing/adapters.js';
import { companyAdminRepository } from '../../repositories/companyAdminRepository.js';
import {
  computeSubscriptionsKpis,
  listSubscriptionsOverview,
} from '../subscriptionsOverviewService.js';

const STARTER_CONFIG = {
  plan: 'starter' as const,
  displayName: 'Starter',
  priceAmount: 50000,
  currency: 'NOK',
  discountPercent: 0,
  stripePriceId: 'price_starter',
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeSubscriptionsKpis', () => {
  it('counts subscriptions per status independently', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listByStatus).mockImplementation(async (status) => {
      const counts: Record<string, number> = { active: 3, past_due: 1, trialing: 2, canceled: 0 };
      return Array.from({ length: counts[status] ?? 0 }, () => ({}) as never);
    });

    const result = await computeSubscriptionsKpis();

    expect(result).toEqual({
      activeSubscriptions: 3,
      pastDueSubscriptions: 1,
      trialingSubscriptions: 2,
      canceledSubscriptions: 0,
    });
  });
});

describe('listSubscriptionsOverview', () => {
  it('joins company name, maps nextInvoice from currentPeriodEnd, and estimates amount from PlanConfig', async () => {
    const periodEnd = new Date('2026-09-01T00:00:00.000Z');
    vi.mocked(mongoSubscriptionRepositoryPort.listAll).mockResolvedValue({
      items: [
        {
          id: 'sub-1',
          companyId: 'company-1',
          plan: 'starter',
          status: 'active',
          cancelAtPeriodEnd: false,
          grantedByAdmin: false,
          currentPeriodEnd: periodEnd,
        },
      ],
      total: 1,
    });
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([STARTER_CONFIG]);
    vi.mocked(companyAdminRepository.findById).mockResolvedValue({
      id: 'company-1',
      name: 'Glow Studio',
      slug: 'glow-studio',
      status: 'active',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
      createdAt: new Date(),
    });

    const result = await listSubscriptionsOverview({ page: 1, limit: 20 });

    expect(result.items[0]).toEqual({
      companyId: 'company-1',
      companyName: 'Glow Studio',
      plan: 'starter',
      status: 'active',
      nextInvoice: periodEnd.toISOString(),
      estimatedAmount: 50000,
    });
  });

  it('returns null nextInvoice/companyName and 0 amount when data is missing', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listAll).mockResolvedValue({
      items: [
        {
          id: 'sub-1',
          companyId: 'ghost-company',
          plan: 'business',
          status: 'incomplete',
          cancelAtPeriodEnd: false,
          grantedByAdmin: false,
        },
      ],
      total: 1,
    });
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([]);
    vi.mocked(companyAdminRepository.findById).mockResolvedValue(null);

    const result = await listSubscriptionsOverview({ page: 1, limit: 20 });

    expect(result.items[0]).toMatchObject({
      companyName: null,
      nextInvoice: null,
      estimatedAmount: 0,
    });
  });

  it('dedupes company lookups when multiple subscriptions share a company', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listAll).mockResolvedValue({
      items: [
        {
          id: 'sub-1',
          companyId: 'company-1',
          plan: 'starter',
          status: 'active',
          cancelAtPeriodEnd: false,
          grantedByAdmin: false,
        },
        {
          id: 'sub-2',
          companyId: 'company-1',
          plan: 'starter',
          status: 'past_due',
          cancelAtPeriodEnd: false,
          grantedByAdmin: false,
        },
      ],
      total: 2,
    });
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([STARTER_CONFIG]);
    vi.mocked(companyAdminRepository.findById).mockResolvedValue({
      id: 'company-1',
      name: 'Glow Studio',
      slug: 'glow-studio',
      status: 'active',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
      createdAt: new Date(),
    });

    await listSubscriptionsOverview({ page: 1, limit: 20 });

    expect(companyAdminRepository.findById).toHaveBeenCalledTimes(1);
  });

  it('applies discountPercent to the estimated amount', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.listAll).mockResolvedValue({
      items: [
        {
          id: 'sub-1',
          companyId: 'company-1',
          plan: 'starter',
          status: 'active',
          cancelAtPeriodEnd: false,
          grantedByAdmin: false,
        },
      ],
      total: 1,
    });
    vi.mocked(mongoPlanConfigRepositoryPort.listAll).mockResolvedValue([
      { ...STARTER_CONFIG, discountPercent: 20 },
    ]);
    vi.mocked(companyAdminRepository.findById).mockResolvedValue(null);

    const result = await listSubscriptionsOverview({ page: 1, limit: 20 });

    expect(result.items[0]?.estimatedAmount).toBe(40000); // 50000 * 0.8
  });
});
