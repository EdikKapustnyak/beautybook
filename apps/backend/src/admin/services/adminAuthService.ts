import { adminAuthConfig } from '../config.js';
import { UnauthorizedError } from '../../shared/errors/AppError.js';
import { verifyPassword } from '../../shared/security/password.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
} from '../../shared/security/tokens.js';
import {
  adminTokenVersionKey,
  type TokenVersionRevocationStore,
} from '../../shared/security/tokenVersionRevocation.js';
import type {
  AdminSessionRepositoryPort,
  AdminUserRecord,
  AdminUserRepositoryPort,
} from '../repositories/types.js';

export interface AdminAuthServiceDeps {
  adminUserRepo: AdminUserRepositoryPort;
  adminSessionRepo: AdminSessionRepositoryPort;
  tokenVersionRevocationStore: TokenVersionRevocationStore;
  now?: () => Date;
}

export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicAdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminUserRecord['role'];
}

export interface AdminRequestContext {
  userAgent?: string;
  ip?: string;
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
const GENERIC_REFRESH_ERROR = 'Invalid or expired refresh token.';

export function createAdminAuthService(deps: AdminAuthServiceDeps) {
  const { adminUserRepo, adminSessionRepo, tokenVersionRevocationStore } = deps;
  const now = deps.now ?? (() => new Date());

  function toPublicAdminUser(user: AdminUserRecord): PublicAdminUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  function signAccess(user: Pick<AdminUserRecord, 'id' | 'role' | 'tokenVersion'>): string {
    return signAccessToken(
      { sub: user.id, role: user.role, tokenVersion: user.tokenVersion },
      adminAuthConfig.accessTokenSecret,
      adminAuthConfig.accessTokenTtlSeconds,
    );
  }

  async function issueSession(
    user: Pick<AdminUserRecord, 'id'>,
    ctx: AdminRequestContext,
  ): Promise<string> {
    const refreshToken = generateOpaqueToken();
    const expiresAt = new Date(now().getTime() + adminAuthConfig.refreshTokenTtlSeconds * 1000);
    await adminSessionRepo.create({
      adminUserId: user.id,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    return refreshToken;
  }

  return {
    async login(
      input: { email: string; password: string },
      ctx: AdminRequestContext = {},
    ): Promise<{ adminUser: PublicAdminUser } & AdminAuthTokens> {
      const normalizedEmail = input.email.trim().toLowerCase();
      const user = await adminUserRepo.findByEmail(normalizedEmail);

      if (!user || user.status !== 'active') {
        throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
      }

      const passwordMatches = await verifyPassword(input.password, user.passwordHash);
      if (!passwordMatches) {
        throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
      }

      const accessToken = signAccess(user);
      const refreshToken = await issueSession(user, ctx);
      await adminUserRepo.updateLastLoginAt(user.id, now());

      return { adminUser: toPublicAdminUser(user), accessToken, refreshToken };
    },

    async refresh(
      input: { refreshToken: string },
      ctx: AdminRequestContext = {},
    ): Promise<AdminAuthTokens> {
      const presentedHash = hashOpaqueToken(input.refreshToken);
      const session = await adminSessionRepo.findByRefreshTokenHash(presentedHash);

      if (!session) {
        throw new UnauthorizedError(GENERIC_REFRESH_ERROR);
      }
      if (session.expiresAt.getTime() <= now().getTime()) {
        throw new UnauthorizedError(GENERIC_REFRESH_ERROR);
      }
      if (session.revokedAt) {
        await adminSessionRepo.revokeAllForAdminUser(session.adminUserId);
        throw new UnauthorizedError(
          'This session was revoked because a reused refresh token was detected. Please log in again.',
        );
      }

      const user = await adminUserRepo.findById(session.adminUserId);
      if (!user || user.status !== 'active') {
        await adminSessionRepo.revokeAllForAdminUser(session.adminUserId);
        throw new UnauthorizedError(GENERIC_REFRESH_ERROR);
      }

      const newRefreshToken = generateOpaqueToken();
      const newExpiresAt = new Date(
        now().getTime() + adminAuthConfig.refreshTokenTtlSeconds * 1000,
      );
      const newSession = await adminSessionRepo.create({
        adminUserId: session.adminUserId,
        refreshTokenHash: hashOpaqueToken(newRefreshToken),
        expiresAt: newExpiresAt,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      });

      const revoked = await adminSessionRepo.revokeIfActive(session.id, newSession.id);
      if (!revoked) {
        await adminSessionRepo.revokeAllForAdminUser(session.adminUserId);
        throw new UnauthorizedError(
          'This session was revoked because a reused refresh token was detected. Please log in again.',
        );
      }

      return { accessToken: signAccess(user), refreshToken: newRefreshToken };
    },

    async logout(input: { refreshToken: string }): Promise<void> {
      const hash = hashOpaqueToken(input.refreshToken);
      const session = await adminSessionRepo.findByRefreshTokenHash(hash);
      if (session) {
        await adminSessionRepo.revokeIfActive(session.id);
      }
    },

    async logoutAll(input: { adminUserId: string }): Promise<void> {
      await adminSessionRepo.revokeAllForAdminUser(input.adminUserId);
    },

    /** Same rationale as authService.updateUserRoleOrStatus — see there. */
    async updateAdminRoleOrStatus(input: {
      adminUserId: string;
      updates: Partial<Pick<AdminUserRecord, 'role' | 'status'>>;
    }): Promise<PublicAdminUser | null> {
      const user = await adminUserRepo.updateRoleOrStatus(input.adminUserId, input.updates);
      if (!user) {
        return null;
      }
      await tokenVersionRevocationStore.revoke(
        adminTokenVersionKey(user.id),
        user.tokenVersion,
        adminAuthConfig.accessTokenTtlSeconds,
      );
      await adminSessionRepo.revokeAllForAdminUser(user.id);
      return toPublicAdminUser(user);
    },
  };
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>;
