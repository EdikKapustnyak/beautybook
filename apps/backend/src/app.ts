import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { adminCorsConfig } from './admin/config.js';
import { adminRouter } from './admin/router.js';
import { isAppError } from './shared/errors/AppError.js';
import { tenantCorsConfig } from './tenant/config.js';
import { tenantRouter } from './tenant/router.js';

export function createApp(): Express {
  const app = express();

  // Security headers (Helmet) and a bounded JSON body size apply globally.
  // CORS is deliberately NOT global — see beautybook-security-measures.md
  // §21: the public/tenant surface and the platform-admin surface each get
  // their own allowlist below, so the public frontend's origin is never
  // implicitly trusted by admin endpoints, or vice versa.
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  // Refresh tokens live only in httpOnly cookies — cookie-parser is what
  // makes req.cookies available to the auth controllers. It never touches
  // the Authorization header (access tokens), which stay in memory only
  // on the frontend. See security-measures.md §2.
  app.use(cookieParser());
  app.disable('x-powered-by');

  // Health/readiness endpoints — see project overview §32 Observability.
  // These deliberately return no internal details and need no CORS
  // allowlist (no credentials, not browser-driven).
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { status: 'ready' } });
  });

  // Public + tenant surface (landing pages, tenant dashboard). Own CORS
  // allowlist, own cookie name, own JWT secrets — see src/tenant/config.ts.
  // Feature routes (auth, company, bookings, ...) are added inside
  // tenantRouter in later stages.
  app.use(
    '/api/tenant',
    cors({ origin: tenantCorsConfig.allowedOrigins, credentials: true }),
    tenantRouter,
  );

  // Platform admin surface (apps/admin only). Separate CORS allowlist, own
  // cookie name, own JWT secrets — see src/admin/config.ts. The public
  // frontend's origin is never included here. Feature routes (admin auth,
  // company list, subscription overview, ...) are added inside adminRouter
  // in later stages.
  app.use(
    '/api/admin',
    cors({ origin: adminCorsConfig.allowedOrigins, credentials: true }),
    adminRouter,
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });

  // Centralized error handler — never leaks stack traces, Mongo errors,
  // or provider secrets to the client. See technical spec §18. AppError
  // instances (thrown deliberately by services/controllers) carry their
  // own safe status/code/message; anything else is an unexpected bug and
  // gets a generic 500 with no details.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isAppError(err)) {
      res.status(err.httpStatus).json({
        success: false,
        error: { code: err.code, message: err.publicMessage },
      });
      return;
    }

    console.error(err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
  });

  return app;
}
