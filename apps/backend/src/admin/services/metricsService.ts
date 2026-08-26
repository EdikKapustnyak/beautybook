// apps/backend/src/admin/services/metricsService.ts
//
// dev-tasks.md §22's "Metrics" checklist item — MVP scope: MRR only (not
// churn/usage/error metrics, which need real observability
// infrastructure — dev-tasks.md §32, not built yet).
//
// IMPORTANT — this is an ESTIMATE, not authoritative billing data.
// PlanConfig.priceAmount/discountPercent are informational fields an
// admin sets locally (see shared/billing/planConfig.model.ts's own "not
// necessarily what Stripe actually charges" caveat) — Stripe is the
// real source of truth for what any individual subscription is actually
// being billed. This estimate multiplies each ACTIVE subscription's plan
// by that plan's CURRENT priceAmount/discountPercent, which will disagree
// with reality for any subscription whose price was locked in before the
// admin last changed the plan's price or discount. Good enough for an
// at-a-glance dashboard number; never present it as a reconciled
// financial figure.

import {
  mongoPlanConfigRepositoryPort,
  mongoSubscriptionRepositoryPort,
} from '../../shared/billing/adapters.js';
import type { SubscriptionPlan } from '../../shared/billing/subscription.model.js';

export interface MrrBreakdownEntry {
  plan: SubscriptionPlan;
  activeSubscriptions: number;
  estimatedMrr: number;
}

export interface MrrSummary {
  totalEstimatedMrr: number;
  currency: string;
  totalActiveSubscriptions: number;
  byPlan: MrrBreakdownEntry[];
}

export async function computeEstimatedMrr(): Promise<MrrSummary> {
  const [activeSubscriptions, planConfigs] = await Promise.all([
    mongoSubscriptionRepositoryPort.listByStatus('active'),
    mongoPlanConfigRepositoryPort.listAll(),
  ]);

  const planConfigByPlan = new Map(planConfigs.map((config) => [config.plan, config]));
  const countByPlan = new Map<SubscriptionPlan, number>();
  for (const subscription of activeSubscriptions) {
    countByPlan.set(subscription.plan, (countByPlan.get(subscription.plan) ?? 0) + 1);
  }

  const byPlan: MrrBreakdownEntry[] = [...countByPlan.entries()].map(([plan, count]) => {
    const config = planConfigByPlan.get(plan);
    const discountMultiplier = config ? 1 - config.discountPercent / 100 : 1;
    const pricePerSeat = config ? Math.round(config.priceAmount * discountMultiplier) : 0;
    return { plan, activeSubscriptions: count, estimatedMrr: pricePerSeat * count };
  });

  return {
    totalEstimatedMrr: byPlan.reduce((sum, entry) => sum + entry.estimatedMrr, 0),
    // MVP simplification: assumes every plan is priced in the same
    // currency (true today — see planConfigRepository.ts's seed
    // defaults, all 'NOK'). Revisit if multi-currency plans are ever
    // introduced.
    currency: planConfigs[0]?.currency ?? 'NOK',
    totalActiveSubscriptions: activeSubscriptions.length,
    byPlan,
  };
}
