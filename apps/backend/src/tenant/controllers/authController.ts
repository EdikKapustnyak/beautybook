import type { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { tenantAuthConfig } from '../config.js';
import { mongoUserRepositoryPort } from '../repositories/authRepositoryAdapters.js';
import { authService } from '../services/authService.instance.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validation/authSchemas.js';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    // Scoped to the auth endpoints only — the cookie has no reason to be
    // sent on every tenant API request, only refresh/logout.
    path: '/api/tenant/auth',
    maxAge: tenantAuthConfig.refreshTokenTtlSeconds * 1000,
  };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(tenantAuthConfig.refreshCookieName, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(tenantAuthConfig.refreshCookieName, { path: '/api/tenant/auth' });
}

function requestContext(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

export const register = asyncHandler(async (req, res) => {
  const input = parseOrThrow(registerSchema, req.body);
  const result = await authService.registerCompanyAndOwner(input, requestContext(req));

  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    success: true,
    data: { user: result.user, accessToken: result.accessToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const input = parseOrThrow(loginSchema, req.body);
  const result = await authService.login(input, requestContext(req));

  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    success: true,
    data: { user: result.user, accessToken: result.accessToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const presentedToken: unknown = req.cookies?.[tenantAuthConfig.refreshCookieName];
  if (typeof presentedToken !== 'string' || presentedToken.length === 0) {
    throw new UnauthorizedError('No refresh token was provided.');
  }

  const result = await authService.refresh({ refreshToken: presentedToken }, requestContext(req));

  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  const presentedToken: unknown = req.cookies?.[tenantAuthConfig.refreshCookieName];
  if (typeof presentedToken === 'string' && presentedToken.length > 0) {
    await authService.logout({ refreshToken: presentedToken });
  }

  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: {} });
});

export const logoutAll = asyncHandler(async (req, res) => {
  if (!req.tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }

  await authService.logoutAll({ userId: req.tenantAuth.userId });
  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: {} });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const input = parseOrThrow(forgotPasswordSchema, req.body);
  const result = await authService.forgotPassword(input);

  // Never put the token in the HTTP response — see security-measures.md
  // §1. Development-only convenience logging, server-side only.
  if (env.NODE_ENV === 'development' && result.devOnlyResetToken) {
    // eslint-disable-next-line no-console
    console.info(`[dev-only] Password reset token for ${input.email}: ${result.devOnlyResetToken}`);
  }

  // Identical response whether or not the account exists.
  res.status(200).json({
    success: true,
    data: { message: 'If an account exists for that email, a password reset link has been sent.' },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const input = parseOrThrow(resetPasswordSchema, req.body);
  await authService.resetPassword(input);
  res.status(200).json({ success: true, data: {} });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const user = await mongoUserRepositoryPort.findByIdInCompany(
    req.tenantAuth.userId,
    req.tenantAuth.companyId,
  );
  if (!user) {
    throw new UnauthorizedError('Authentication is required.');
  }

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
  });
});
