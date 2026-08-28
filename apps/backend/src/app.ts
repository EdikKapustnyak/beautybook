import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import { adminCorsConfig } from './admin/config.js';
import { adminRouter } from './admin/router.js';
import { isAppError } from './shared/errors/AppError.js';
import { createRateLimiter } from './shared/http/rateLimit.js';
import { tenantCorsConfig } from './tenant/config.js';
import { stripeWebhook } from './tenant/controllers/stripeWebhookController.js';
import { tenantRouter } from './tenant/router.js';

export function createApp(): Express {
  const app = express();

  // Security headers apply globally; the JSON body parser does NOT
  // (see the Stripe webhook route immediately below) — see
  // beautybook-security-measures.md §21 for the CORS-allowlist reasoning
  // covered further down.
  app.use(helmet());

  // Stripe webhook — MUST be registered BEFORE `express.json()` below.
  // Signature verification (security-measures.md §20, "работает с raw
  // body") needs the exact, unparsed request bytes; `express.json()`
  // would have already consumed and replaced them with a parsed object
  // by the time any route handler ran. `express.raw()` is scoped to
  // ONLY this one path — every other route still gets normal JSON
  // parsing via the global middleware right after. No CORS wrapper
  // either: this is a server-to-server callback from Stripe, never a
  // browser request, so it isn't part of either the tenant or
  // platform-admin CORS-allowlisted surface below.
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

  app.use(express.json({ limit: '1mb' }));
  // Refresh tokens live only in httpOnly cookies — cookie-parser is what
  // makes req.cookies available to the auth controllers. It never touches
  // the Authorization header (access tokens), which stay in memory only
  // on the frontend. See security-measures.md §2.
  app.use(cookieParser());
  app.disable('x-powered-by');

  // dev-tasks.md §23 "Global API limiter" — a broad, generously-bounded
  // backstop, distinct from (and layered on top of, never replacing) the
  // tighter endpoint-specific limiters already on login/register/OTP/
  // booking/password-reset. Those stay because they encode a much
  // stricter, endpoint-appropriate policy (e.g. 5 login attempts/15min);
  // this one exists purely to bound overall request volume from a single
  // IP against every OTHER route that has no dedicated limiter of its
  // own (list/search/read endpoints, etc.) — the exact gap the full
  // security audit (dev-tasks.md §30) flagged. Deliberately NOT applied
  // to /health, /ready, or /webhooks/stripe: health checks shouldn't be
  // throttled, and Stripe's webhook senders can legitimately burst from
  // a shared pool of IPs — that endpoint already has its own defense
  // (signature verification), not an IP-count-based one.
  const globalTenantApiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 600,
    message: 'Too many requests. Please try again later.',
  });
  const globalAdminApiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    // Tighter than the tenant surface — same "admin accounts are
    // high-value targets, smaller trusted user base" reasoning already
    // applied to admin/routes/adminAuthRoutes.ts's own loginLimiter.
    max: 300,
    message: 'Too many requests. Please try again later.',
  });

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
    globalTenantApiLimiter,
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
    globalAdminApiLimiter,
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
