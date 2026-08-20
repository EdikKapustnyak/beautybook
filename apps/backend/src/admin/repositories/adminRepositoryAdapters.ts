import { adminSessionRepository } from './adminSessionRepository.js';
import { adminUserRepository } from './adminUserRepository.js';
import type {
  AdminSessionRecord,
  AdminSessionRepositoryPort,
  AdminUserRecord,
  AdminUserRepositoryPort,
} from './types.js';

function toAdminUserRecord(doc: {
  _id: unknown;
  email: string;
  passwordHash: string;
  name: string;
  role: AdminUserRecord['role'];
  status: AdminUserRecord['status'];
}): AdminUserRecord {
  return {
    id: String(doc._id),
    email: doc.email,
    passwordHash: doc.passwordHash,
    name: doc.name,
    role: doc.role,
    status: doc.status,
  };
}

export const mongoAdminUserRepositoryPort: AdminUserRepositoryPort = {
  async findByEmail(email) {
    const doc = await adminUserRepository.findByEmailForLogin(email);
    return doc ? toAdminUserRecord(doc) : null;
  },
  async findById(id) {
    const doc = await adminUserRepository.findById(id);
    return doc ? toAdminUserRecord(doc) : null;
  },
  async updateLastLoginAt(adminUserId, date) {
    await adminUserRepository.updateLastLoginAt(adminUserId, date);
  },
};

function toAdminSessionRecord(doc: {
  _id: unknown;
  adminUserId: unknown;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: unknown;
}): AdminSessionRecord {
  return {
    id: String(doc._id),
    adminUserId: String(doc.adminUserId),
    refreshTokenHash: doc.refreshTokenHash,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
    replacedBySessionId: doc.replacedBySessionId ? String(doc.replacedBySessionId) : undefined,
  };
}

export const mongoAdminSessionRepositoryPort: AdminSessionRepositoryPort = {
  async create(data) {
    const doc = await adminSessionRepository.create(data);
    return toAdminSessionRecord(doc);
  },
  async findByRefreshTokenHash(hash) {
    const doc = await adminSessionRepository.findByRefreshTokenHash(hash);
    return doc ? toAdminSessionRecord(doc) : null;
  },
  async revokeIfActive(sessionId, replacedBySessionId) {
    return adminSessionRepository.revokeIfActive(sessionId, replacedBySessionId);
  },
  async revokeAllForAdminUser(adminUserId) {
    await adminSessionRepository.revokeAllForAdminUser(adminUserId);
  },
};
