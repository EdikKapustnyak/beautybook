// apps/backend/src/shared/billing/planConfigRepository.ts

import {
  PlanConfigModel,
  type PlanConfigAttrs,
  type PlanConfigDocument,
} from './planConfig.model.js';
import type { SubscriptionPlan } from './subscription.model.js';

export type PlanConfigUpdate = Partial<
  Pick<
    PlanConfigAttrs,
    'displayName' | 'priceAmount' | 'currency' | 'discountPercent' | 'stripePriceId' | 'active'
  >
>;

export const planConfigRepository = {
  async findByPlan(plan: SubscriptionPlan): Promise<PlanConfigDocument | null> {
    return PlanConfigModel.findOne({ plan }).exec();
  },

  async listAll(): Promise<PlanConfigDocument[]> {
    return PlanConfigModel.find({}).sort({ plan: 1 }).exec();
  },

  /**
   * Bootstraps a row from env-var defaults the first time a plan is read
   * and no admin-managed row exists yet — avoids a chicken-and-egg
   * problem where checkout is broken on a fresh install until someone
   * remembers to visit the admin panel first. Once created, all
   * subsequent reads/writes go through the DB row; the env vars are only
   * ever consulted for this one-time seed.
   */
  async findOrSeedByPlan(
    plan: SubscriptionPlan,
    seedDefaults: Pick<
      PlanConfigAttrs,
      'displayName' | 'priceAmount' | 'currency' | 'stripePriceId'
    >,
  ): Promise<PlanConfigDocument> {
    const existing = await PlanConfigModel.findOne({ plan }).exec();
    if (existing) return existing;
    return PlanConfigModel.create({ plan, discountPercent: 0, active: true, ...seedDefaults });
  },

  async updateByPlan(
    plan: SubscriptionPlan,
    updates: PlanConfigUpdate,
  ): Promise<PlanConfigDocument | null> {
    return PlanConfigModel.findOneAndUpdate({ plan }, { $set: updates }, { new: true }).exec();
  },
};
