// apps/backend/src/tenant/routes/publicRoutes.ts
//
// CONFIRMED mounting (real tenant/router.ts and app.ts inspected this
// session): this router mounts as `tenantRouter.use('/public',
// publicRouter)` — see the accompanying modified tenant/router.ts in this
// delta — giving the real final path `/api/tenant/public/:slug/...`. No
// separate CORS layer is needed: app.ts already applies ONE shared CORS
// policy (`cors({ origin: tenantCorsConfig.allowedOrigins, credentials:
// true })`) to the entire `/api/tenant` mount, covering both the
// authenticated tenant surface and this public surface, because
// apps/frontend is a single Next.js app serving both the public landing
// pages and the tenant dashboard from the same origin. The earlier
// standalone `shared/http/publicCors.ts` this session produced is
// unnecessary and has been removed from this delta.
//
// Router-construction pattern confirmed against the real employeeRoutes.ts
// AND bookingController.ts: `export const xRouter: Router = Router();`,
// plain method/path/handler wiring, explicit type annotation per this
// project's strict-TypeScript rule (no inferred exported const types).
//
// There is NO validateBody/validateParams/validateQuery middleware in this
// codebase — bookingController.ts confirms every schema is parsed INSIDE
// the handler via `parseOrThrow(schema, req.body/params/query)`. Routes
// below carry only method, path, rate limiter (where applicable), and
// handler — no validation middleware layer. None of these routes use
// `requireTenantAuth`/`requireTenantRole` — deliberate, this is the public
// unauthenticated surface.

import { Router } from 'express';

import {
  getPublicCompany,
  getPublicServices,
  getPublicEmployees,
  getPublicAvailability,
  requestPhoneVerification,
  confirmPhoneVerification,
  createPublicBooking,
  cancelPublicBooking,
  reschedulePublicBooking,
} from '../controllers/publicController.js';
import {
  publicAvailabilityLimiter,
  publicCompanyLookupLimiter,
  publicOtpRequestLimiter,
  publicOtpVerifyLimiter,
  publicBookingLimiter,
  publicBookingManagementLimiter,
} from '../middleware/publicRateLimiters.js';

export const publicRouter: Router = Router();

publicRouter.get('/:slug', publicCompanyLookupLimiter, getPublicCompany);
publicRouter.get('/:slug/services', publicCompanyLookupLimiter, getPublicServices);
publicRouter.get('/:slug/employees', publicCompanyLookupLimiter, getPublicEmployees);
publicRouter.get('/:slug/availability', publicAvailabilityLimiter, getPublicAvailability);

publicRouter.post(
  '/:slug/booking/verify-phone/request',
  publicOtpRequestLimiter,
  requestPhoneVerification,
);
publicRouter.post(
  '/:slug/booking/verify-phone/confirm',
  publicOtpVerifyLimiter,
  confirmPhoneVerification,
);
// DECIDED: two sub-routes (request/confirm) rather than one endpoint
// branching on a body field, chosen over technical-spec.md §7's literal
// single-URL listing. Reasons: (1) independent, honestly-tunable rate
// limits — requestOtp triggers a real paid SMS and needs a much tighter
// limiter than confirmOtp's brute-force-guard limiter, which a shared
// URL would blur; (2) access logs show which action happened without
// parsing the request body, useful for abuse alerting; (3) each route
// keeps a single flat Zod schema instead of a discriminated union.

publicRouter.post('/:slug/booking', publicBookingLimiter, createPublicBooking);
publicRouter.post(
  '/:slug/booking/:token/cancel',
  publicBookingManagementLimiter,
  cancelPublicBooking,
);
publicRouter.post(
  '/:slug/booking/:token/reschedule',
  publicBookingManagementLimiter,
  reschedulePublicBooking,
);
