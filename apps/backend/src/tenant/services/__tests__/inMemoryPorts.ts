import { randomUUID } from 'node:crypto';

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
