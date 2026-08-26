// apps/backend/src/admin/services/subscriptionsOverviewService.ts
//
// dev-tasks.md §22's "Subscriptions" checklist item — the design mockup
// (BeautyBook Platform Admin) shows a KPI row + an invoice-style table
// (Company, Plan, Next invoice, Amount, Status). "Next invoice" maps
// directly to Subscription.currentPeriodEnd (kept in sync by
// subscriptionService.ts's webhook handler — real Stripe data, not an
// estimate). "Amount" does NOT have a per-subscription authoritative
// local value (this codebase never stores what a specific subscription
// was actually charged, only what the PLAN currently costs) — see
// metricsService.ts's identical estimate caveat, which applies here too.

import {
  mongoPlanConfigRepositoryPort,
  mongoSubscriptionRepositoryPort,
} from '../../shared/billing/adapters.js';
import type { SubscriptionRecord } from '../../shared/billing/types.js';
import { companyAdminRepository } from '../repositories/companyAdminRepository.js';

export interface SubscriptionOverviewRow {
  companyId: string;
  companyName: string | null;
  plan: SubscriptionRecord['plan'];
  status: SubscriptionRecord['status'];
  /** ISO date string or null — Subscription.currentPeriodEnd, real Stripe data. */
  nextInvoice: string | null;
  /** ESTIMATE — see this file's header. */
  estimatedAmount: number;
}

export interface SubscriptionsKpis {
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  trialingSubscriptions: number;
  canceledSubscriptions: number;
}

export async function computeSubscriptionsKpis(): Promise<SubscriptionsKpis> {
  const [active, pastDue, trialing, canceled] = await Promise.all([
    mongoSubscriptionRepositoryPort.listByStatus('active'),
    mongoSubscriptionRepositoryPort.listByStatus('past_due'),
    mongoSubscriptionRepositoryPort.listByStatus('trialing'),
    mongoSubscriptionRepositoryPort.listByStatus('canceled'),
  ]);
  return {
    activeSubscriptions: active.length,
    pastDueSubscriptions: pastDue.length,
    trialingSubscriptions: trialing.length,
    canceledSubscriptions: canceled.length,
  };
}

export async function listSubscriptionsOverview(options: {
  page: number;
  limit: number;
}): Promise<{ items: SubscriptionOverviewRow[]; total: number }> {
  const [{ items: subscriptions, total }, planConfigs] = await Promise.all([
    mongoSubscriptionRepositoryPort.listAll(options),
    mongoPlanConfigRepositoryPort.listAll(),
  ]);

  const planConfigByPlan = new Map(planConfigs.map((config) => [config.plan, config]));

  // Unique company ids resolved FIRST, in their own pass — resolving
  // them lazily inside the per-subscription Promise.all below would race
  // (two subscriptions for the same company could both see the cache
  // empty and both trigger a lookup, since `.map(async ...)` runs every
  // iteration concurrently, not sequentially).
  const uniqueCompanyIds = [...new Set(subscriptions.map((s) => s.companyId))];
  const companyNameById = new Map<string, string | null>();
  await Promise.all(
    uniqueCompanyIds.map(async (companyId) => {
      const company = await companyAdminRepository.findById(companyId);
      companyNameById.set(companyId, company?.name ?? null);
    }),
  );

  const items = subscriptions.map((subscription) => {
    const planConfig = planConfigByPlan.get(subscription.plan);
    const discountMultiplier = planConfig ? 1 - planConfig.discountPercent / 100 : 1;
    const estimatedAmount = planConfig
      ? Math.round(planConfig.priceAmount * discountMultiplier)
      : 0;

    return {
      companyId: subscription.companyId,
      companyName: companyNameById.get(subscription.companyId) ?? null,
      plan: subscription.plan,
      status: subscription.status,
      nextInvoice: subscription.currentPeriodEnd?.toISOString() ?? null,
      estimatedAmount,
    };
  });

  return { items, total };
}
