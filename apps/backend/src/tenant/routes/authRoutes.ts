import { Router } from 'express';

import { createRateLimiter } from '../../shared/http/rateLimit.js';
import {
  forgotPassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
  resetPassword,
} from '../controllers/authController.js';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';

export const tenantAuthRouter: Router = Router();

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many registration attempts. Please try again later.',
});

const forgotPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.',
});

// dev-tasks.md §23 / security-measures.md §3 explicitly pair "forgot
// password" and "reset password" as needing their own limiter each —
// this one was missing (forgotPasswordLimiter above only covers the
// request-a-token step). A slightly higher cap than forgotPasswordLimiter
// since a legitimate user can plausibly mistype their new password once
// or twice before succeeding; still bounded well below anything useful
// for token-guessing (reset tokens are long random strings — brute force
// isn't feasible in single-digit-per-hour attempts either way, but
// per-IP throttling here is still the defense-in-depth layer this
// checklist item calls for).
const resetPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please try again later.',
});

const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many requests. Please try again later.',
});

tenantAuthRouter.post('/register', registerLimiter, register);
tenantAuthRouter.post('/login', loginLimiter, login);
tenantAuthRouter.post('/refresh', refreshLimiter, refresh);
tenantAuthRouter.post('/logout', logout);
tenantAuthRouter.post('/logout-all', requireTenantAuth, logoutAll);
tenantAuthRouter.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
tenantAuthRouter.post('/reset-password', resetPasswordLimiter, resetPassword);
tenantAuthRouter.get('/me', requireTenantAuth, me);
