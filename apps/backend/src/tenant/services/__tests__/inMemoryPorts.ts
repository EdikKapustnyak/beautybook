import { randomUUID } from 'node:crypto';

import type {
  StripeCheckoutSessionInput,
  StripeGatewayPort,
  StripeWebhookEvent,
} from '../../../shared/payments/stripeGateway.js';
import type {
  PlanConfigRecord,
  PlanConfigRepositoryPort,
  StripeEventLedgerPort,
  SubscriptionRecord,
  SubscriptionRepositoryPort,
} from '../../../shared/billing/types.js';
import { createTokenVersionRevocationStore } from '../../../shared/security/tokenVersionRevocation.js';
import type {
  CompanyRecord,
  CompanyRepositoryPort,
  PasswordResetTokenRecord,
  PasswordResetTokenRepositoryPort,
  SessionRecord,
  SessionRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from '../../repositories/types.js';
import type { SubscriptionNotifierPort } from '../subscriptionNotifier.js';

const DEFAULT_BOOKING_SETTINGS: CompanyRecord['bookingSettings'] = {
  allowOnlineCancel: true,
  allowOnlineReschedule: true,
  minNoticeMinutes: 60,
  maxAdvanceBookingDays: 60,
};

export function createInMemoryCompanyRepo(): CompanyRepositoryPort {
  const companies = new Map<string, CompanyRecord>();
  return {
    async create(data) {
      const record: CompanyRecord = {
        id: randomUUID(),
        status: 'draft',
        bookingSettings: DEFAULT_BOOKING_SETTINGS,
        theme: 'classic',
        socialLinks: {},
        ...data,
      };
      companies.set(record.id, record);
      return record;
    },
    async slugExists(slug) {
      return [...companies.values()].some((company) => company.slug === slug);
    },
    async findById(companyId) {
      return companies.get(companyId) ?? null;
    },
    async updateById(companyId, updates) {
      const existing = companies.get(companyId);
      if (!existing) {
        return null;
      }
      const updated: CompanyRecord = { ...existing, ...updates };
      companies.set(companyId, updated);
      return updated;
    },
  };
}

export function createInMemoryUserRepo(): UserRepositoryPort {
  const users = new Map<string, UserRecord>();
  return {
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findByIdInCompany(id, companyId) {
      const user = users.get(id);
      return user && user.companyId === companyId ? user : null;
    },
    async create(data) {
      const record: UserRecord = { id: randomUUID(), status: 'active', tokenVersion: 0, ...data };
      users.set(record.id, record);
      return record;
    },
    async updatePasswordHash(userId, passwordHash) {
      const user = users.get(userId);
      if (user) {
        user.passwordHash = passwordHash;
      }
    },
    async updateLastLoginAt() {
      // Not asserted on in tests; intentionally a no-op.
    },
    async updateRoleOrStatus(userId, companyId, updates) {
      const user = users.get(userId);
      if (!user || user.companyId !== companyId) {
        return null;
      }
      const updated: UserRecord = { ...user, ...updates, tokenVersion: user.tokenVersion + 1 };
      users.set(userId, updated);
      return updated;
    },
  };
}

export function createInMemorySessionRepo(): SessionRepositoryPort {
  const sessions = new Map<string, SessionRecord>();
  return {
    async create(data) {
      const record: SessionRecord = { id: randomUUID(), ...data };
      sessions.set(record.id, record);
      return record;
    },
    async findByRefreshTokenHash(hash) {
      return [...sessions.values()].find((session) => session.refreshTokenHash === hash) ?? null;
    },
    async revokeIfActive(sessionId, replacedBySessionId) {
      const session = sessions.get(sessionId);
      if (!session || session.revokedAt) {
        return false;
      }
      session.revokedAt = new Date();
      if (replacedBySessionId) {
        session.replacedBySessionId = replacedBySessionId;
      }
      return true;
    },
    async revokeAllForUser(userId) {
      for (const session of sessions.values()) {
        if (session.userId === userId && !session.revokedAt) {
          session.revokedAt = new Date();
        }
      }
    },
  };
}

export function createInMemoryResetTokenRepo(): PasswordResetTokenRepositoryPort {
  const tokens = new Map<string, PasswordResetTokenRecord>();
  return {
    async create(data) {
      const record: PasswordResetTokenRecord = { id: randomUUID(), ...data };
      tokens.set(record.id, record);
      return record;
    },
    async findByTokenHash(hash) {
      return [...tokens.values()].find((token) => token.tokenHash === hash) ?? null;
    },
    async markUsedIfUnused(tokenId) {
      const token = tokens.get(tokenId);
      if (!token || token.usedAt) {
        return false;
      }
      token.usedAt = new Date();
      return true;
    },
  };
}

/**
 * In-memory fake for authService's tokenVersionRevocationStore dep —
 * reuses the REAL store factory with a fake Redis client (not a
 * hand-rolled reimplementation of the store's own compare logic), so
 * these tests exercise the actual isRevoked/revoke behavior, just
 * without a real Redis connection. Exposes `.data` so tests can assert
 * on exactly what got written.
 */
export function createInMemoryTokenVersionRevocationStore() {
  const data = new Map<string, string>();
  const store = createTokenVersionRevocationStore({
    async set(key, value) {
      data.set(key, value);
      return 'OK';
    },
    async get(key) {
      return data.get(key) ?? null;
    },
  });
  return { ...store, data };
}

export function createInMemorySubscriptionRepo(): SubscriptionRepositoryPort {
  const byCompanyId = new Map<string, SubscriptionRecord>();
  return {
    async findByCompanyId(companyId) {
      return byCompanyId.get(companyId) ?? null;
    },
    async findByStripeCustomerId(stripeCustomerId) {
      return [...byCompanyId.values()].find((s) => s.stripeCustomerId === stripeCustomerId) ?? null;
    },
    async create(data) {
      const record: SubscriptionRecord = {
        id: randomUUID(),
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
    async updateByStripeCustomerId(stripeCustomerId, updates) {
      const existing = [...byCompanyId.values()].find(
        (s) => s.stripeCustomerId === stripeCustomerId,
      );
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      byCompanyId.set(existing.companyId, updated);
      return updated;
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

/** Same reserve-before-create atomicity contract as the real Mongo unique-index-backed ledger. */
export function createInMemoryStripeEventLedger(): StripeEventLedgerPort {
  const seen = new Set<string>();
  return {
    async recordIfNew(stripeEventId) {
      if (seen.has(stripeEventId)) return false;
      seen.add(stripeEventId);
      return true;
    },
  };
}

export function createInMemoryStripeGateway(): StripeGatewayPort & {
  createdCustomers: { companyId: string; email: string; name: string }[];
  createdCheckoutSessions: StripeCheckoutSessionInput[];
  createdPortalSessions: { stripeCustomerId: string; returnUrl: string }[];
  createdCoupons: number[];
  createdPromotionCodes: { code: string; percentOff: number }[];
  nextConstructedEvent: StripeWebhookEvent | Error | null;
} {
  const customerIdByCompanyId = new Map<string, string>();
  const createdCustomers: { companyId: string; email: string; name: string }[] = [];
  const createdCheckoutSessions: StripeCheckoutSessionInput[] = [];
  const createdPortalSessions: { stripeCustomerId: string; returnUrl: string }[] = [];
  const createdCoupons: number[] = [];
  const createdPromotionCodes: { code: string; percentOff: number }[] = [];
  let nextConstructedEvent: StripeWebhookEvent | Error | null = null;

  return {
    createdCustomers,
    createdCheckoutSessions,
    createdPortalSessions,
    createdCoupons,
    createdPromotionCodes,
    get nextConstructedEvent() {
      return nextConstructedEvent;
    },
    set nextConstructedEvent(value) {
      nextConstructedEvent = value;
    },
    async findOrCreateCustomer(input) {
      const existing = customerIdByCompanyId.get(input.companyId);
      if (existing) return { stripeCustomerId: existing };
      const stripeCustomerId = `cus_${randomUUID()}`;
      customerIdByCompanyId.set(input.companyId, stripeCustomerId);
      createdCustomers.push(input);
      return { stripeCustomerId };
    },
    async createCheckoutSession(input) {
      createdCheckoutSessions.push(input);
      return { url: `https://checkout.stripe.com/test/${randomUUID()}` };
    },
    async createBillingPortalSession(input) {
      createdPortalSessions.push(input);
      return { url: `https://billing.stripe.com/test/${randomUUID()}` };
    },
    async findOrCreatePercentOffCoupon(percent) {
      createdCoupons.push(percent);
      return { stripeCouponId: `pct_off_${percent}` };
    },
    async createPromotionCode({ code, percentOff }) {
      createdPromotionCodes.push({ code, percentOff });
      return {
        stripeCouponId: `coupon_${randomUUID()}`,
        stripePromotionCodeId: `promo_${randomUUID()}`,
      };
    },
    constructWebhookEvent() {
      if (nextConstructedEvent instanceof Error) {
        throw nextConstructedEvent;
      }
      if (!nextConstructedEvent) {
        throw new Error('Test setup error: nextConstructedEvent was not configured.');
      }
      return nextConstructedEvent;
    },
  };
}

export function createInMemoryPlanConfigRepo(): PlanConfigRepositoryPort {
  const byPlan = new Map<string, PlanConfigRecord>();
  return {
    async findByPlan(plan) {
      return byPlan.get(plan) ?? null;
    },
    async listAll() {
      return [...byPlan.values()];
    },
    async findOrSeedByPlan(plan, seedDefaults) {
      const existing = byPlan.get(plan);
      if (existing) return existing;
      const record: PlanConfigRecord = {
        plan,
        discountPercent: 0,
        active: true,
        ...seedDefaults,
      };
      byPlan.set(plan, record);
      return record;
    },
    async updateByPlan(plan, updates) {
      const existing = byPlan.get(plan);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      byPlan.set(plan, updated);
      return updated;
    },
  };
}

export function createInMemorySubscriptionNotifier(): SubscriptionNotifierPort & {
  notifiedPaymentFailures: { companyId: string; companyName: string }[];
} {
  const notifiedPaymentFailures: { companyId: string; companyName: string }[] = [];
  return {
    notifiedPaymentFailures,
    async notifyOwnerPaymentFailed(input) {
      notifiedPaymentFailures.push(input);
    },
  };
}
