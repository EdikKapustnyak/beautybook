import { Router, type Request, type Response } from 'express';

import { adminAuthConfig } from './config.js';
import { adminSubscriptionRouter } from './routes/adminSubscriptionRoutes.js';
import { adminAuthRouter } from './routes/adminAuthRoutes.js';
import { auditLogRouter } from './routes/auditLogRoutes.js';
import { companyAdminRouter } from './routes/companyAdminRoutes.js';
import { discountCodeRouter } from './routes/discountCodeRoutes.js';
import { metricsRouter } from './routes/metricsRoutes.js';
import { planConfigRouter } from './routes/planConfigRoutes.js';
import { platformSettingsRouter } from './routes/platformSettingsRoutes.js';
import { subscriptionsOverviewRouter } from './routes/subscriptionsOverviewRoutes.js';
import { supportTicketRouter } from './routes/supportTicketRoutes.js';
import { systemStatusRouter } from './routes/systemStatusRoutes.js';
import { usageRouter } from './routes/usageRoutes.js';
import { userAdminRouter } from './routes/userAdminRoutes.js';

export const adminRouter: Router = Router();

adminRouter.use('/auth', adminAuthRouter);
// Platform-wide plan/pricing configuration — see
// admin/controllers/planConfigController.ts.
adminRouter.use('/plans', planConfigRouter);
// Stripe-backed promotion codes — see
// admin/controllers/discountCodeController.ts.
adminRouter.use('/discount-codes', discountCodeRouter);
// Company list/detail/suspend — dev-tasks.md §22. See
// admin/controllers/companyAdminController.ts.
adminRouter.use('/companies', companyAdminRouter);
// Per-company subscription view + manual grant — see
// admin/controllers/adminSubscriptionController.ts.
adminRouter.use('/companies/:companyId/subscription', adminSubscriptionRouter);
// Global subscriptions list + KPIs — see
// admin/controllers/subscriptionsOverviewController.ts.
adminRouter.use('/subscriptions', subscriptionsOverviewRouter);
// MRR — see admin/controllers/metricsController.ts.
adminRouter.use('/metrics', metricsRouter);
// Cross-tenant user list — see admin/controllers/userAdminController.ts.
adminRouter.use('/users', userAdminRouter);
// Platform-admin action history — see
// admin/controllers/auditLogController.ts.
adminRouter.use('/audit-logs', auditLogRouter);
// Platform name/support email/default currency/trial length — see
// admin/controllers/platformSettingsController.ts.
adminRouter.use('/settings', platformSettingsRouter);
// Bookings/SMS/storage per company — see admin/controllers/usageController.ts.
adminRouter.use('/usage', usageRouter);
// Support ticket triage — see admin/controllers/supportTicketController.ts.
adminRouter.use('/support-tickets', supportTicketRouter);
// Real MongoDB/Redis health + integration config — see
// admin/controllers/systemStatusController.ts. Distinct from the
// unauthenticated `/status` diagnostic below (config wiring only).
adminRouter.use('/system', systemStatusRouter);

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
