import type { AdminUserRole, AdminUserStatus } from '../models/adminUser.model.js';

export interface AdminUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  tokenVersion: number;
}

export interface AdminSessionRecord {
  id: string;
  adminUserId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: string;
}

export interface AdminUserRepositoryPort {
  findByEmail(email: string): Promise<AdminUserRecord | null>;
  findById(id: string): Promise<AdminUserRecord | null>;
  updateLastLoginAt(adminUserId: string, date: Date): Promise<void>;
  /** Same rationale as UserRepositoryPort.updateRoleOrStatus — see there. */
  updateRoleOrStatus(
    adminUserId: string,
    updates: Partial<Pick<AdminUserRecord, 'role' | 'status'>>,
  ): Promise<AdminUserRecord | null>;
}

export interface AdminSessionRepositoryPort {
  create(data: {
    adminUserId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<AdminSessionRecord>;
  findByRefreshTokenHash(hash: string): Promise<AdminSessionRecord | null>;
  revokeIfActive(sessionId: string, replacedBySessionId?: string): Promise<boolean>;
  revokeAllForAdminUser(adminUserId: string): Promise<void>;
}
