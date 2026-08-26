import { Router, type Request, type Response } from 'express';

import { tenantAuthConfig } from './config.js';
import { tenantAuthRouter } from './routes/authRoutes.js';
import { availabilityRouter } from './routes/availabilityRoutes.js';
import { blockedTimeRouter } from './routes/blockedTimeRoutes.js';
import { bookingAttachmentRouter } from './routes/bookingAttachmentRoutes.js';
import { bookingRouter } from './routes/bookingRoutes.js';
import { companyRouter } from './routes/companyRoutes.js';
import { customerRouter } from './routes/customerRoutes.js';
import { employeeRouter } from './routes/employeeRoutes.js';
import { portfolioRouter } from './routes/portfolioRoutes.js';
import { publicRouter } from './routes/publicRoutes.js';
import { serviceRouter } from './routes/serviceRoutes.js';
import { subscriptionRouter } from './routes/subscriptionRoutes.js';
import { teamRouter } from './routes/teamRoutes.js';

export const tenantRouter: Router = Router();

tenantRouter.use('/auth', tenantAuthRouter);
tenantRouter.use('/company', companyRouter);
tenantRouter.use('/employees', employeeRouter);
tenantRouter.use('/services', serviceRouter);
tenantRouter.use('/blocked-time', blockedTimeRouter);
tenantRouter.use('/availability', availabilityRouter);
tenantRouter.use('/bookings', bookingRouter);
tenantRouter.use('/bookings/:bookingId/attachments', bookingAttachmentRouter);
tenantRouter.use('/customers', customerRouter);
tenantRouter.use('/portfolio', portfolioRouter);
// TenantUser (login account) role/status management — see
// tenant/controllers/teamController.ts for scope notes. Deliberately
// separate from '/employees' (the Employee roster model) — see the
// "Employee vs. TenantUser" distinction in README.md's Stage 5/7 section.
tenantRouter.use('/team', teamRouter);
// Stripe Checkout session creation + subscription status — see
// subscriptionController.ts. The webhook that actually confirms payment
// is NOT here; see app.ts for why.
tenantRouter.use('/subscription', subscriptionRouter);
// Public, unauthenticated surface (technical-spec.md §7) — landing page,
// services/employees/availability, phone verification, and the public
// booking flow. Mounted here (not as a separate app.ts entry) so it
// shares the same CORS policy as the rest of /api/tenant, since
// apps/frontend serves both the public landing pages and the tenant
// dashboard from one origin. Final path: /api/tenant/public/:slug/...
// See tenant/routes/publicRoutes.ts and tenant/controllers/publicController.ts.
tenantRouter.use('/public', publicRouter);

// Proves, at runtime, that this surface is wired to the tenant config
// (by cookie name only — never a secret value). Feature routes (auth,
// company, bookings, ...) are added here in later stages.
tenantRouter.get('/status', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      surface: 'tenant',
      refreshCookieName: tenantAuthConfig.refreshCookieName,
    },
  });
});
