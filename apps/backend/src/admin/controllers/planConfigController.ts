// apps/backend/src/admin/controllers/planConfigController.ts
//
// Platform-wide plan/pricing configuration — see tenant/models/planConfig.model.ts's
// header for the important "Stripe Price objects are immutable" caveat
// on what "changing the price" actually means here.

import { env } from '../../config/env.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { mongoPlanConfigRepositoryPort } from '../../shared/billing/adapters.js';
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '../../shared/billing/subscription.model.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { planParamSchema, updatePlanConfigSchema } from '../validation/planConfigSchemas.js';

/** Same seed defaults subscriptionService.instance.ts uses — see that file's comment on why priceAmount is 0. */
const SEED_DEFAULTS: Record<
  SubscriptionPlan,
  { displayName: string; priceAmount: number; currency: string; stripePriceId: string }
> = {
  starter: {
    displayName: 'Starter',
    priceAmount: 0,
    currency: 'NOK',
    stripePriceId: env.STRIPE_PRICE_ID_STARTER,
  },
  business: {
    displayName: 'Business',
    priceAmount: 0,
    currency: 'NOK',
    stripePriceId: env.STRIPE_PRICE_ID_BUSINESS,
  },
};

export const listPlanConfigs = asyncHandler(async (_req, res) => {
  // Ensures every plan has a row (bootstraps any missing ones from env
  // defaults) so a fresh install's admin panel is never an empty list —
  // see planConfigRepository.ts's findOrSeedByPlan doc comment.
  const plans = await Promise.all(
    SUBSCRIPTION_PLANS.map((plan) =>
      mongoPlanConfigRepositoryPort.findOrSeedByPlan(plan, SEED_DEFAULTS[plan]),
    ),
  );
  res.status(200).json({ success: true, data: { plans } });
});

export const updatePlanConfig = asyncHandler(async (req, res) => {
  const { plan } = parseOrThrow(planParamSchema, req.params);
  const updates = parseOrThrow(updatePlanConfigSchema, req.body);

  // Ensure the row exists before updating (fresh install safety, same
  // reasoning as listPlanConfigs above).
  await mongoPlanConfigRepositoryPort.findOrSeedByPlan(plan, SEED_DEFAULTS[plan]);
  const updated = await mongoPlanConfigRepositoryPort.updateByPlan(plan, updates);
  if (!updated) {
    throw new NotFoundError('Plan not found.');
  }

  // dev-tasks.md §27: pricing changes are a listed critical audit event
  // — see admin/models/auditLog.model.ts's header.
  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'plan_config.updated',
    targetType: 'plan',
    targetId: plan,
    metadata: updates,
  });

  res.status(200).json({ success: true, data: { plan: updated } });
});
