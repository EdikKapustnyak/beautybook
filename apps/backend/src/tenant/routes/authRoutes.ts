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
tenantAuthRouter.post('/reset-password', resetPassword);
tenantAuthRouter.get('/me', requireTenantAuth, me);
