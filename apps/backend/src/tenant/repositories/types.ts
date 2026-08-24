import type { BookingSettings } from '../models/company.model.js';
import type { TenantUserRole, TenantUserStatus } from '../models/user.model.js';

export interface CompanyRecord {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  coverImage?: string;
  timezone: string;
  currency: string;
  bookingSettings: BookingSettings;
  status: string;
}

export interface UserRecord {
  id: string;
  companyId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: TenantUserRole;
  status: TenantUserStatus;
  tokenVersion: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  companyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export interface CompanyProfileUpdate {
  name?: string;
  description?: string;
  logo?: string;
  coverImage?: string;
  timezone?: string;
  currency?: string;
  bookingSettings?: Partial<BookingSettings>;
}

export interface CompanyRepositoryPort {
  create(data: {
    name: string;
    slug: string;
    timezone: string;
    currency: string;
  }): Promise<CompanyRecord>;
  slugExists(slug: string): Promise<boolean>;
  findById(companyId: string): Promise<CompanyRecord | null>;
  /**
   * Deliberately cannot update `slug` or `status` — those go through
   * dedicated, audited flows (slug changes affect the public URL; status
   * changes are platform-admin-only), never a generic profile PATCH.
   */
  updateById(
    companyId: string,
    updates: Omit<CompanyProfileUpdate, 'bookingSettings'> & { bookingSettings?: BookingSettings },
  ): Promise<CompanyRecord | null>;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | null>;
  findByIdInCompany(id: string, companyId: string): Promise<UserRecord | null>;
  create(data: {
    companyId: string;
    email: string;
    passwordHash: string;
    name: string;
    role: TenantUserRole;
  }): Promise<UserRecord>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateLastLoginAt(userId: string, date: Date): Promise<void>;
  /**
   * Deliberately a DEDICATED method, not folded into a generic profile
   * update — same reasoning as CompanyRepositoryPort.updateById excluding
   * `slug`/`status` (see the comment there): role/status changes are
   * security-sensitive enough to want a single, auditable call site, and
   * this is also where tokenVersion gets atomically incremented (see the
   * concrete implementation in userRepository.ts). Returns the updated
   * record (including the new tokenVersion) so the caller (authService)
   * can write the Redis revocation record without a second read.
   */
  updateRoleOrStatus(
    userId: string,
    companyId: string,
    updates: Partial<Pick<UserRecord, 'role' | 'status'>>,
  ): Promise<UserRecord | null>;
}

export interface SessionRepositoryPort {
  create(data: {
    userId: string;
    companyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<SessionRecord>;
  findByRefreshTokenHash(hash: string): Promise<SessionRecord | null>;
  /** Atomic: only succeeds if the session was not already revoked. Returns false on reuse. */
  revokeIfActive(sessionId: string, replacedBySessionId?: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface PasswordResetTokenRepositoryPort {
  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord>;
  findByTokenHash(hash: string): Promise<PasswordResetTokenRecord | null>;
  /** Atomic: only succeeds if the token was not already used. Returns false on reuse. */
  markUsedIfUnused(tokenId: string): Promise<boolean>;
}
