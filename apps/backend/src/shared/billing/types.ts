// apps/backend/src/shared/billing/types.ts
//
// DI ports for the billing collections (Subscription, PlanConfig,
// StripeWebhookEvent) — deliberately in shared/, not tenant/, because
// BOTH the tenant surface (checkout, portal — subscriptionService.ts)
// AND the platform-admin surface (plan/pricing management, manual
// subscription grants — admin/controllers/) need to read/write them, and
// eslint.config.js hard-enforces that admin/** may never import from
// tenant/** (or vice versa) — see that file's no-restricted-imports
// rules and their comment: "tenant and platform-admin auth must stay
// fully separate". Billing data is genuinely cross-cutting platform
// data, not tenant-owned business logic, so it lives outside both trees.

import type { SubscriptionPlan, SubscriptionStatus } from './subscription.model.js';

export interface SubscriptionRecord {
  id: string;
  companyId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  grantedByAdmin: boolean;
  grantedReason?: string;
}

export type SubscriptionStateUpdate = Partial<
  Pick<
    SubscriptionRecord,
    | 'stripeSubscriptionId'
    | 'plan'
    | 'status'
    | 'currentPeriodStart'
    | 'currentPeriodEnd'
    | 'cancelAtPeriodEnd'
    | 'grantedByAdmin'
    | 'grantedReason'
  >
>;

export interface SubscriptionRepositoryPort {
  findByCompanyId(companyId: string): Promise<SubscriptionRecord | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<SubscriptionRecord | null>;
  create(data: {
    companyId: string;
    plan: SubscriptionPlan;
    stripeCustomerId?: string;
    status?: SubscriptionStatus;
    grantedByAdmin?: boolean;
    grantedReason?: string;
  }): Promise<SubscriptionRecord>;
  updateByCompanyId(
    companyId: string,
    updates: SubscriptionStateUpdate,
  ): Promise<SubscriptionRecord | null>;
  /**
   * See shared/billing/subscriptionRepository.ts's updateByStripeCustomerId
   * doc comment for why every webhook handler updates by customer id,
   * never subscription id.
   */
  updateByStripeCustomerId(
    stripeCustomerId: string,
    updates: SubscriptionStateUpdate,
  ): Promise<SubscriptionRecord | null>;
  /**
   * Platform-wide list, no companyId filter — see
   * subscriptionRepository.ts's listByStatus doc comment.
   */
  listByStatus(status: SubscriptionStatus): Promise<SubscriptionRecord[]>;
  /** Paginated, unfiltered — see subscriptionRepository.ts's listAll doc comment. */
  listAll(options: { page: number; limit: number }): Promise<{
    items: SubscriptionRecord[];
    total: number;
  }>;
}

export interface StripeEventLedgerPort {
  recordIfNew(stripeEventId: string, type: string): Promise<boolean>;
}

export interface PlanConfigRecord {
  plan: SubscriptionPlan;
  displayName: string;
  priceAmount: number;
  currency: string;
  discountPercent: number;
  stripePriceId: string;
  active: boolean;
}

export type PlanConfigUpdate = Partial<
  Pick<
    PlanConfigRecord,
    'displayName' | 'priceAmount' | 'currency' | 'discountPercent' | 'stripePriceId' | 'active'
  >
>;

export interface PlanConfigRepositoryPort {
  findByPlan(plan: SubscriptionPlan): Promise<PlanConfigRecord | null>;
  listAll(): Promise<PlanConfigRecord[]>;
  findOrSeedByPlan(
    plan: SubscriptionPlan,
    seedDefaults: Pick<
      PlanConfigRecord,
      'displayName' | 'priceAmount' | 'currency' | 'stripePriceId'
    >,
  ): Promise<PlanConfigRecord>;
  updateByPlan(plan: SubscriptionPlan, updates: PlanConfigUpdate): Promise<PlanConfigRecord | null>;
}

/**
 * Deliberately minimal — the ONE thing shared/billing/grantSubscription.ts
 * needs from "company data" is an existence check, so this is NOT the
 * full CompanyRepositoryPort (tenant/repositories/types.ts) — that type
 * lives in tenant/ and, per the import boundary above, could never be
 * used from admin/ anyway.
 */
export interface CompanyExistsPort {
  exists(companyId: string): Promise<boolean>;
}

export interface DiscountCodeRecord {
  code: string;
  percentOff: number;
  appliesToPlans: SubscriptionPlan[];
  maxRedemptions?: number;
  expiresAt?: Date;
  active: boolean;
  stripeCouponId: string;
  stripePromotionCodeId: string;
}

export interface DiscountCodeRepositoryPort {
  list(): Promise<DiscountCodeRecord[]>;
  findByCode(code: string): Promise<DiscountCodeRecord | null>;
  create(data: {
    code: string;
    percentOff: number;
    stripeCouponId: string;
    stripePromotionCodeId: string;
    appliesToPlans?: SubscriptionPlan[];
    maxRedemptions?: number;
    expiresAt?: Date;
  }): Promise<DiscountCodeRecord>;
  setActive(code: string, active: boolean): Promise<DiscountCodeRecord | null>;
}
