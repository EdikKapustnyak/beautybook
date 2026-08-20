import { Router, type Request, type Response } from 'express';

import { adminAuthConfig } from './config.js';
import { adminAuthRouter } from './routes/adminAuthRoutes.js';

export const adminRouter: Router = Router();

adminRouter.use('/auth', adminAuthRouter);

// Proves, at runtime, that this surface is wired to the admin config
// (by cookie name only — never a secret value). Feature routes (platform
// admin auth, company list, subscription overview, ...) are added here
// in later stages.
adminRouter.get('/status', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      surface: 'admin',
      refreshCookieName: adminAuthConfig.refreshCookieName,
    },
  });
});
