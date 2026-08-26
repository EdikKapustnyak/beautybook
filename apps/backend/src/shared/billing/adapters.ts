// apps/backend/src/shared/billing/adapters.ts
//
// Wraps the raw Mongoose repositories into SubscriptionRepositoryPort /
// PlanConfigRepositoryPort / StripeEventLedgerPort — same toXRecord() +
// port-object layering as tenant/repositories/authRepositoryAdapters.ts,
// but living in shared/ so both tenant/services/subscriptionService.ts
// and admin/controllers/*.ts can import it (see types.ts's header for
// why this can't live under tenant/).

import { discountCodeRepository } from './discountCodeRepository.js';
import { planConfigRepository } from './planConfigRepository.js';
import { stripeWebhookEventRepository } from './stripeWebhookEventRepository.js';
import { subscriptionRepository } from './subscriptionRepository.js';
import type {
  DiscountCodeRecord,
  DiscountCodeRepositoryPort,
  PlanConfigRecord,
  PlanConfigRepositoryPort,
  StripeEventLedgerPort,
  SubscriptionRecord,
  SubscriptionRepositoryPort,
} from './types.js';

function toSubscriptionRecord(doc: {
  _id: unknown;
  companyId: unknown;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan: SubscriptionRecord['plan'];
  status: SubscriptionRecord['status'];
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  grantedByAdmin: boolean;
  grantedReason?: string;
}): SubscriptionRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    stripeCustomerId: doc.stripeCustomerId,
    stripeSubscriptionId: doc.stripeSubscriptionId,
    plan: doc.plan,
    status: doc.status,
    currentPeriodStart: doc.currentPeriodStart,
    currentPeriodEnd: doc.currentPeriodEnd,
    cancelAtPeriodEnd: doc.cancelAtPeriodEnd,
    grantedByAdmin: doc.grantedByAdmin,
    grantedReason: doc.grantedReason,
  };
}

export const mongoSubscriptionRepositoryPort: SubscriptionRepositoryPort = {
  async findByCompanyId(companyId) {
    const doc = await subscriptionRepository.findByCompanyId(companyId);
    return doc ? toSubscriptionRecord(doc) : null;
  },
  async findByStripeCustomerId(stripeCustomerId) {
    const doc = await subscriptionRepository.findByStripeCustomerId(stripeCustomerId);
    return doc ? toSubscriptionRecord(doc) : null;
  },
  async create(data) {
    const doc = await subscriptionRepository.create(data);
    return toSubscriptionRecord(doc);
  },
  async updateByCompanyId(companyId, updates) {
    const doc = await subscriptionRepository.updateByCompanyId(companyId, updates);
    return doc ? toSubscriptionRecord(doc) : null;
  },
  async updateByStripeCustomerId(stripeCustomerId, updates) {
    const doc = await subscriptionRepository.updateByStripeCustomerId(stripeCustomerId, updates);
    return doc ? toSubscriptionRecord(doc) : null;
  },
  async listByStatus(status) {
    const docs = await subscriptionRepository.listByStatus(status);
    return docs.map(toSubscriptionRecord);
  },
  async listAll(options) {
    const { items, total } = await subscriptionRepository.listAll(options);
    return { items: items.map(toSubscriptionRecord), total };
  },
};

export const mongoStripeEventLedgerPort: StripeEventLedgerPort = {
  async recordIfNew(stripeEventId, type) {
    return stripeWebhookEventRepository.recordIfNew(stripeEventId, type);
  },
};

function toPlanConfigRecord(doc: {
  plan: PlanConfigRecord['plan'];
  displayName: string;
  priceAmount: number;
  currency: string;
  discountPercent: number;
  stripePriceId: string;
  active: boolean;
}): PlanConfigRecord {
  return {
    plan: doc.plan,
    displayName: doc.displayName,
    priceAmount: doc.priceAmount,
    currency: doc.currency,
    discountPercent: doc.discountPercent,
    stripePriceId: doc.stripePriceId,
    active: doc.active,
  };
}

export const mongoPlanConfigRepositoryPort: PlanConfigRepositoryPort = {
  async findByPlan(plan) {
    const doc = await planConfigRepository.findByPlan(plan);
    return doc ? toPlanConfigRecord(doc) : null;
  },
  async listAll() {
    const docs = await planConfigRepository.listAll();
    return docs.map(toPlanConfigRecord);
  },
  async findOrSeedByPlan(plan, seedDefaults) {
    const doc = await planConfigRepository.findOrSeedByPlan(plan, seedDefaults);
    return toPlanConfigRecord(doc);
  },
  async updateByPlan(plan, updates) {
    const doc = await planConfigRepository.updateByPlan(plan, updates);
    return doc ? toPlanConfigRecord(doc) : null;
  },
};

function toDiscountCodeRecord(doc: {
  code: string;
  percentOff: number;
  appliesToPlans: DiscountCodeRecord['appliesToPlans'];
  maxRedemptions?: number;
  expiresAt?: Date;
  active: boolean;
  stripeCouponId: string;
  stripePromotionCodeId: string;
}): DiscountCodeRecord {
  return {
    code: doc.code,
    percentOff: doc.percentOff,
    appliesToPlans: doc.appliesToPlans,
    maxRedemptions: doc.maxRedemptions,
    expiresAt: doc.expiresAt,
    active: doc.active,
    stripeCouponId: doc.stripeCouponId,
    stripePromotionCodeId: doc.stripePromotionCodeId,
  };
}

export const mongoDiscountCodeRepositoryPort: DiscountCodeRepositoryPort = {
  async list() {
    const docs = await discountCodeRepository.list();
    return docs.map(toDiscountCodeRecord);
  },
  async findByCode(code) {
    const doc = await discountCodeRepository.findByCode(code);
    return doc ? toDiscountCodeRecord(doc) : null;
  },
  async create(data) {
    const doc = await discountCodeRepository.create(data);
    return toDiscountCodeRecord(doc);
  },
  async setActive(code, active) {
    const doc = await discountCodeRepository.setActive(code, active);
    return doc ? toDiscountCodeRecord(doc) : null;
  },
};
