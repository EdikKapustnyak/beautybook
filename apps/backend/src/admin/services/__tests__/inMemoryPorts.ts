import { randomUUID } from 'node:crypto';

import { createTokenVersionRevocationStore } from '../../../shared/security/tokenVersionRevocation.js';
import type {
  AdminSessionRecord,
  AdminSessionRepositoryPort,
  AdminUserRecord,
  AdminUserRepositoryPort,
} from '../../repositories/types.js';

export function createInMemoryAdminUserRepo(
  seed: Omit<AdminUserRecord, 'id' | 'tokenVersion'>[] = [],
): AdminUserRepositoryPort {
  const users = new Map<string, AdminUserRecord>();
  for (const user of seed) {
    const id = randomUUID();
    users.set(id, { id, tokenVersion: 0, ...user });
  }
  return {
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async updateLastLoginAt() {
      // Not asserted on in tests; intentionally a no-op.
    },
    async updateRoleOrStatus(adminUserId, updates) {
      const user = users.get(adminUserId);
      if (!user) {
        return null;
      }
      const updated: AdminUserRecord = { ...user, ...updates, tokenVersion: user.tokenVersion + 1 };
      users.set(adminUserId, updated);
      return updated;
    },
  };
}

export function createInMemoryAdminSessionRepo(): AdminSessionRepositoryPort {
  const sessions = new Map<string, AdminSessionRecord>();
  return {
    async create(data) {
      const record: AdminSessionRecord = { id: randomUUID(), ...data };
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
    async revokeAllForAdminUser(adminUserId) {
      for (const session of sessions.values()) {
        if (session.adminUserId === adminUserId && !session.revokedAt) {
          session.revokedAt = new Date();
        }
      }
    },
  };
}

/** Same rationale as the tenant-side helper of the same name — see there. */
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
