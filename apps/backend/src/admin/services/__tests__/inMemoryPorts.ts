import { randomUUID } from 'node:crypto';

import type {
  AdminSessionRecord,
  AdminSessionRepositoryPort,
  AdminUserRecord,
  AdminUserRepositoryPort,
} from '../../repositories/types.js';

export function createInMemoryAdminUserRepo(
  seed: Omit<AdminUserRecord, 'id'>[] = [],
): AdminUserRepositoryPort {
  const users = new Map<string, AdminUserRecord>();
  for (const user of seed) {
    const id = randomUUID();
    users.set(id, { id, ...user });
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
