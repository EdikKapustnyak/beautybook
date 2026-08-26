// apps/backend/src/tenant/repositories/subscriptionRepository.ts
//
// Raw Mongoose CRUD for Subscription — mirrors companyRepository.ts's
// shape/conventions. Consumed only through subscriptionRepositoryAdapters.ts's
// SubscriptionRepositoryPort wrapper (never imported directly by
// subscriptionService.ts), same layering as companyRepository.ts /
// authRepositoryAdapters.ts / companyService.ts.

import type { Types } from 'mongoose';

import { withTenantScope } from '../../shared/tenantScope.js';
import {
  SubscriptionModel,
  type SubscriptionAttrs,
  type SubscriptionDocument,
} from '../models/subscription.model.js';

export type CreateSubscriptionInput = Pick<SubscriptionAttrs, 'stripeCustomerId' | 'plan'> &
  Partial<Pick<SubscriptionAttrs, 'status'>> & { companyId: string | Types.ObjectId };

export type SubscriptionStateUpdate = Partial<
  Pick<
    SubscriptionAttrs,
    | 'stripeSubscriptionId'
    | 'plan'
    | 'status'
    | 'currentPeriodStart'
    | 'currentPeriodEnd'
    | 'cancelAtPeriodEnd'
  >
>;

export const subscriptionRepository = {
  async findByCompanyId(companyId: string | Types.ObjectId): Promise<SubscriptionDocument | null> {
    return SubscriptionModel.findOne(withTenantScope(String(companyId), {})).exec();
  },

  async findByStripeCustomerId(stripeCustomerId: string): Promise<SubscriptionDocument | null> {
    return SubscriptionModel.findOne({ stripeCustomerId }).exec();
  },

  async create(data: CreateSubscriptionInput): Promise<SubscriptionDocument> {
    return SubscriptionModel.create(data);
  },

  /**
   * By companyId — used when we already know which company the update
   * belongs to (e.g. right after finding-or-creating the Stripe
   * Customer for a checkout). Tenant-scoped like every other
   * `updateById*InCompany`-style method in this codebase.
   */
  async updateByCompanyId(
    companyId: string | Types.ObjectId,
    updates: SubscriptionStateUpdate,
  ): Promise<SubscriptionDocument | null> {
    return SubscriptionModel.findOneAndUpdate(
      withTenantScope(String(companyId), {}),
      { $set: updates },
      { new: true },
    ).exec();
  },

  /**
   * By stripeCustomerId — the ONE key every webhook handler uses to find
   * the row, deliberately never `stripeSubscriptionId`. A Subscription
   * document (with `stripeCustomerId` set) is always created BEFORE
   * checkout begins (subscriptionService.createCheckoutSession), so this
   * lookup is guaranteed to succeed for every event Stripe can send —
   * including `customer.subscription.updated` arriving before
   * `checkout.session.completed` has run (Stripe does not guarantee
   * delivery order, dev-tasks.md §21 "out-of-order event"). Looking up
   * by `stripeSubscriptionId` instead would silently no-op in exactly
   * that race, permanently losing the update.
   */
  async updateByStripeCustomerId(
    stripeCustomerId: string,
    updates: SubscriptionStateUpdate,
  ): Promise<SubscriptionDocument | null> {
    return SubscriptionModel.findOneAndUpdate(
      { stripeCustomerId },
      { $set: updates },
      { new: true },
    ).exec();
  },
};
