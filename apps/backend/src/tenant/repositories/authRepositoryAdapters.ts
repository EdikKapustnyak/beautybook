import { companyRepository } from './companyRepository.js';
import { passwordResetTokenRepository } from './passwordResetTokenRepository.js';
import { sessionRepository } from './sessionRepository.js';
import type {
  CompanyRecord,
  CompanyRepositoryPort,
  PasswordResetTokenRecord,
  PasswordResetTokenRepositoryPort,
  SessionRecord,
  SessionRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from './types.js';
import { userRepository } from './userRepository.js';

function toCompanyRecord(doc: {
  _id: unknown;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  coverImage?: string;
  timezone: string;
  currency: string;
  bookingSettings: CompanyRecord['bookingSettings'];
  status: string;
}): CompanyRecord {
  return {
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    logo: doc.logo,
    coverImage: doc.coverImage,
    timezone: doc.timezone,
    currency: doc.currency,
    bookingSettings: doc.bookingSettings,
    status: doc.status,
  };
}

export const mongoCompanyRepositoryPort: CompanyRepositoryPort = {
  async create(data) {
    const doc = await companyRepository.create(data);
    return toCompanyRecord(doc);
  },
  async slugExists(slug) {
    return companyRepository.slugExists(slug);
  },
  async findById(companyId) {
    const doc = await companyRepository.findById(companyId);
    return doc ? toCompanyRecord(doc) : null;
  },
  async updateById(companyId, updates) {
    const doc = await companyRepository.updateById(companyId, updates);
    return doc ? toCompanyRecord(doc) : null;
  },
};

function toUserRecord(doc: {
  _id: unknown;
  companyId: unknown;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRecord['role'];
  status: UserRecord['status'];
  tokenVersion: number;
}): UserRecord {
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    email: doc.email,
    passwordHash: doc.passwordHash,
    name: doc.name,
    role: doc.role,
    status: doc.status,
    tokenVersion: doc.tokenVersion,
  };
}

export const mongoUserRepositoryPort: UserRepositoryPort = {
  async findByEmail(email) {
    const doc = await userRepository.findByEmailForLogin(email);
    return doc ? toUserRecord(doc) : null;
  },
  async findByIdInCompany(id, companyId) {
    const doc = await userRepository.findByIdInCompany(id, companyId);
    return doc ? toUserRecord(doc) : null;
  },
  async create(data) {
    const doc = await userRepository.createInCompany(data.companyId, {
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role,
      status: 'active',
    });
    return toUserRecord(doc);
  },
  async updatePasswordHash(userId, passwordHash) {
    await userRepository.updatePasswordHash(userId, passwordHash);
  },
  async updateLastLoginAt(userId, date) {
    await userRepository.updateLastLoginAt(userId, date);
  },
  async updateRoleOrStatus(userId, companyId, updates) {
    const doc = await userRepository.updateRoleOrStatusInCompany(userId, companyId, updates);
    return doc ? toUserRecord(doc) : null;
  },
};

function toSessionRecord(doc: {
  _id: unknown;
  userId: unknown;
  companyId: unknown;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: unknown;
}): SessionRecord {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    companyId: String(doc.companyId),
    refreshTokenHash: doc.refreshTokenHash,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
    replacedBySessionId: doc.replacedBySessionId ? String(doc.replacedBySessionId) : undefined,
  };
}

export const mongoSessionRepositoryPort: SessionRepositoryPort = {
  async create(data) {
    const doc = await sessionRepository.create(data);
    return toSessionRecord(doc);
  },
  async findByRefreshTokenHash(hash) {
    const doc = await sessionRepository.findByRefreshTokenHash(hash);
    return doc ? toSessionRecord(doc) : null;
  },
  async revokeIfActive(sessionId, replacedBySessionId) {
    return sessionRepository.revokeIfActive(sessionId, replacedBySessionId);
  },
  async revokeAllForUser(userId) {
    await sessionRepository.revokeAllForUser(userId);
  },
};

function toResetTokenRecord(doc: {
  _id: unknown;
  userId: unknown;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}): PasswordResetTokenRecord {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    tokenHash: doc.tokenHash,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt,
  };
}

export const mongoPasswordResetTokenRepositoryPort: PasswordResetTokenRepositoryPort = {
  async create(data) {
    const doc = await passwordResetTokenRepository.create(data);
    return toResetTokenRecord(doc);
  },
  async findByTokenHash(hash) {
    const doc = await passwordResetTokenRepository.findByTokenHash(hash);
    return doc ? toResetTokenRecord(doc) : null;
  },
  async markUsedIfUnused(tokenId) {
    return passwordResetTokenRepository.markUsedIfUnused(tokenId);
  },
};
