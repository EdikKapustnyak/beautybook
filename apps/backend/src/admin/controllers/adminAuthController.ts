import type { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { adminAuthConfig } from '../config.js';
import { adminAuthService } from '../services/adminAuthService.instance.js';
import { adminLoginSchema } from '../validation/adminAuthSchemas.js';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin/auth',
    maxAge: adminAuthConfig.refreshTokenTtlSeconds * 1000,
  };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(adminAuthConfig.refreshCookieName, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(adminAuthConfig.refreshCookieName, { path: '/api/admin/auth' });
}

function requestContext(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

// No `register` handler — platform admin accounts are provisioned only via
// the seed script (src/admin/scripts/createAdminUser.ts), never over HTTP.

export const login = asyncHandler(async (req, res) => {
  const input = parseOrThrow(adminLoginSchema, req.body);
  const result = await adminAuthService.login(input, requestContext(req));

  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    success: true,
    data: { adminUser: result.adminUser, accessToken: result.accessToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const presentedToken: unknown = req.cookies?.[adminAuthConfig.refreshCookieName];
  if (typeof presentedToken !== 'string' || presentedToken.length === 0) {
    throw new UnauthorizedError('No refresh token was provided.');
  }

  const result = await adminAuthService.refresh(
    { refreshToken: presentedToken },
    requestContext(req),
  );

  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  const presentedToken: unknown = req.cookies?.[adminAuthConfig.refreshCookieName];
  if (typeof presentedToken === 'string' && presentedToken.length > 0) {
    await adminAuthService.logout({ refreshToken: presentedToken });
  }

  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: {} });
});

export const logoutAll = asyncHandler(async (req, res) => {
  if (!req.adminAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }

  await adminAuthService.logoutAll({ adminUserId: req.adminAuth.adminUserId });
  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: {} });
});
