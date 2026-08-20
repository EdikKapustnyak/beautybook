import { tenantAuthConfig } from '../config.js';
import { ConflictError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { hashPassword, verifyPassword } from '../../shared/security/password.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
} from '../../shared/security/tokens.js';
import type {
  CompanyRepositoryPort,
  PasswordResetTokenRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
  UserRecord,
} from '../repositories/types.js';

export interface AuthServiceDeps {
  companyRepo: CompanyRepositoryPort;
  userRepo: UserRepositoryPort;
  sessionRepo: SessionRepositoryPort;
  resetTokenRepo: PasswordResetTokenRepositoryPort;
  /** Injected for deterministic tests; defaults to `new Date()`. */
  now?: () => Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: UserRecord['role'];
}

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
const GENERIC_REFRESH_ERROR = 'Invalid or expired refresh token.';
const GENERIC_RESET_ERROR = 'Invalid or expired reset token.';

export function createAuthService(deps: AuthServiceDeps) {
  const { companyRepo, userRepo, sessionRepo, resetTokenRepo } = deps;
  const now = deps.now ?? (() => new Date());

  function toPublicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  function signAccess(user: Pick<UserRecord, 'id' | 'companyId' | 'role'>): string {
    return signAccessToken(
      { sub: user.id, companyId: user.companyId, role: user.role },
      tenantAuthConfig.accessTokenSecret,
      tenantAuthConfig.accessTokenTtlSeconds,
    );
  }

  async function issueSession(
    user: Pick<UserRecord, 'id' | 'companyId'>,
    ctx: RequestContext,
  ): Promise<string> {
    const refreshToken = generateOpaqueToken();
    const expiresAt = new Date(now().getTime() + tenantAuthConfig.refreshTokenTtlSeconds * 1000);
    await sessionRepo.create({
      userId: user.id,
      companyId: user.companyId,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    return refreshToken;
  }

  return {
    /**
     * Creates a new company and its owner user, then logs the owner in.
     * In production this is invoked from the Stripe checkout webhook
     * (Stage 21), not exposed directly as a public "just sign up" endpoint
     * — see project overview §20. The logic itself is reusable either way.
     */
    async registerCompanyAndOwner(
      input: {
        companyName: string;
        slug: string;
        timezone: string;
        currency: string;
        email: string;
        password: string;
        ownerName: string;
      },
      ctx: RequestContext = {},
    ): Promise<{ user: PublicUser } & AuthTokens> {
      const normalizedEmail = input.email.trim().toLowerCase();

      if (await companyRepo.slugExists(input.slug)) {
        throw new ConflictError('That business URL is already taken.');
      }
      if (await userRepo.findByEmail(normalizedEmail)) {
        throw new ConflictError('An account with that email already exists.');
      }

      const company = await companyRepo.create({
        name: input.companyName,
        slug: input.slug,
        timezone: input.timezone,
        currency: input.currency,
      });

      const passwordHash = await hashPassword(input.password);
      const user = await userRepo.create({
        companyId: company.id,
        email: normalizedEmail,
        passwordHash,
        name: input.ownerName,
        role: 'owner',
      });

      const accessToken = signAccess(user);
      const refreshToken = await issueSession(user, ctx);

      return { user: toPublicUser(user), accessToken, refreshToken };
    },

    async login(
      input: { email: string; password: string },
      ctx: RequestContext = {},
    ): Promise<{ user: PublicUser } & AuthTokens> {
      const normalizedEmail = input.email.trim().toLowerCase();
      const user = await userRepo.findByEmail(normalizedEmail);

      // Deliberately identical error for "no such user" and "wrong
      // password" — see security-measures.md §30 (enumeration protection).
      if (!user || user.status !== 'active') {
        throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
      }

      const passwordMatches = await verifyPassword(input.password, user.passwordHash);
      if (!passwordMatches) {
        throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
      }

      const accessToken = signAccess(user);
      const refreshToken = await issueSession(user, ctx);
      await userRepo.updateLastLoginAt(user.id, now());

      return { user: toPublicUser(user), accessToken, refreshToken };
    },

    /**
     * Rotates a refresh token. If the presented token was already rotated
     * out (i.e. reused — a classic sign of theft/replay), the ENTIRE
     * session family for that user is revoked, not just this request.
     * See security-measures.md §2/§16.
     */
    async refresh(input: { refreshToken: string }, ctx: RequestContext = {}): Promise<AuthTokens> {
      const presentedHash = hashOpaqueToken(input.refreshToken);
      const session = await sessionRepo.findByRefreshTokenHash(presentedHash);

      if (!session) {
        throw new UnauthorizedError(GENERIC_REFRESH_ERROR);
      }
      if (session.expiresAt.getTime() <= now().getTime()) {
        throw new UnauthorizedError(GENERIC_REFRESH_ERROR);
      }
      if (session.revokedAt) {
        // Reuse of an already-rotated-out token — treat as compromised.
        await sessionRepo.revokeAllForUser(session.userId);
        throw new UnauthorizedError(
          'This session was revoked because a reused refresh token was detected. Please log in again.',
        );
      }

      const user = await userRepo.findByIdInCompany(session.userId, session.companyId);
      if (!user || user.status !== 'active') {
        await sessionRepo.revokeAllForUser(session.userId);
        throw new UnauthorizedError(GENERIC_REFRESH_ERROR);
      }

      const newRefreshToken = generateOpaqueToken();
      const newExpiresAt = new Date(
        now().getTime() + tenantAuthConfig.refreshTokenTtlSeconds * 1000,
      );
      const newSession = await sessionRepo.create({
        userId: session.userId,
        companyId: session.companyId,
        refreshTokenHash: hashOpaqueToken(newRefreshToken),
        expiresAt: newExpiresAt,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      });

      const revoked = await sessionRepo.revokeIfActive(session.id, newSession.id);
      if (!revoked) {
        // Lost a race with a concurrent refresh of the same token — both
        // resulting sessions are suspect. Fail closed.
        await sessionRepo.revokeAllForUser(session.userId);
        throw new UnauthorizedError(
          'This session was revoked because a reused refresh token was detected. Please log in again.',
        );
      }

      return { accessToken: signAccess(user), refreshToken: newRefreshToken };
    },

    async logout(input: { refreshToken: string }): Promise<void> {
      const hash = hashOpaqueToken(input.refreshToken);
      const session = await sessionRepo.findByRefreshTokenHash(hash);
      if (session) {
        await sessionRepo.revokeIfActive(session.id);
      }
      // Always succeeds from the caller's point of view, even if the token
      // was already invalid/expired — logging out is idempotent.
    },

    async logoutAll(input: { userId: string }): Promise<void> {
      await sessionRepo.revokeAllForUser(input.userId);
    },

    /**
     * Always resolves the same way regardless of whether the email exists
     * — see security-measures.md §30. The plaintext reset token is
     * returned ONLY so the controller can log it server-side in
     * development (no email provider wired up yet, see §1); it must never
     * be included in the HTTP response, in any environment.
     */
    async forgotPassword(input: { email: string }): Promise<{ devOnlyResetToken?: string }> {
      const user = await userRepo.findByEmail(input.email.trim().toLowerCase());
      if (!user) {
        return {};
      }

      const resetToken = generateOpaqueToken();
      const expiresAt = new Date(
        now().getTime() + tenantAuthConfig.passwordResetTokenTtlSeconds * 1000,
      );
      await resetTokenRepo.create({
        userId: user.id,
        tokenHash: hashOpaqueToken(resetToken),
        expiresAt,
      });

      return { devOnlyResetToken: resetToken };
    },

    async resetPassword(input: { token: string; newPassword: string }): Promise<void> {
      const tokenHash = hashOpaqueToken(input.token);
      const record = await resetTokenRepo.findByTokenHash(tokenHash);

      if (!record || record.usedAt || record.expiresAt.getTime() <= now().getTime()) {
        throw new UnauthorizedError(GENERIC_RESET_ERROR);
      }

      const marked = await resetTokenRepo.markUsedIfUnused(record.id);
      if (!marked) {
        // Concurrent use of the same token — fail closed.
        throw new UnauthorizedError(GENERIC_RESET_ERROR);
      }

      const newPasswordHash = await hashPassword(input.newPassword);
      await userRepo.updatePasswordHash(record.userId, newPasswordHash);
      // Per security-measures.md §1: invalidate all existing sessions
      // after a password reset.
      await sessionRepo.revokeAllForUser(record.userId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
