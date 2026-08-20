import { Router } from 'express';

import { createRateLimiter } from '../../shared/http/rateLimit.js';
import { login, logout, logoutAll, refresh } from '../controllers/adminAuthController.js';
import { requireAdminAuth } from '../middleware/requireAdminAuth.js';

export const adminAuthRouter: Router = Router();

// Tighter than tenant login — admin accounts are high-value targets.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again later.',
});

const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many requests. Please try again later.',
});

adminAuthRouter.post('/login', loginLimiter, login);
adminAuthRouter.post('/refresh', refreshLimiter, refresh);
adminAuthRouter.post('/logout', logout);
adminAuthRouter.post('/logout-all', requireAdminAuth, logoutAll);
