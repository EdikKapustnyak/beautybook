// apps/backend/src/tenant/validation/publicSchemas.ts
//
// Zod schemas for the public, unauthenticated API surface
// (technical-spec.md §7). Every param/query/body on every public route
// must go through one of these — no exceptions, per security-measures.md §6.
//
// ASSUMPTION (verify once companySchemas.ts is available): slug format
// below matches the pattern used for slug validation on company creation
// (lowercase alphanumeric segments joined by single hyphens, 3-63 chars).
// If the real schema differs even slightly, public routes and tenant
// creation must be kept in sync or a valid company could become
// unreachable on its own public URL.
//
// ASSUMPTION (verify once otpService.ts internals are re-confirmed for this
// session): OTP code length is 6 digits, matching the "случайный код"
// requirement in technical-spec.md §12 and the Stage 15 description in
// README ("wrong code, expired code, ...").

import { z } from 'zod';

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Invalid slug format'),
});

export const publicAvailabilityQuerySchema = z.object({
  employeeId: z.string().length(24, 'Invalid employeeId'),
  serviceId: z.string().length(24, 'Invalid serviceId'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});
// Bounded to exactly one calendar date per request, mirroring the tenant
// availability endpoint (dev-tasks.md §18 "Availability Abuse" — no
// unbounded date-range requests on a public, unauthenticated route).

export const requestPhoneVerificationSchema = z
  .object({
    phone: z.string().min(8).max(20),
  })
  .strict();

export const confirmPhoneVerificationSchema = z
  .object({
    phone: z.string().min(8).max(20),
    code: z.string().length(6),
  })
  .strict();

export const createPublicBookingSchema = z
  .object({
    phoneVerificationToken: z.string().min(1),
    employeeId: z.string().length(24, 'Invalid employeeId'),
    serviceId: z.string().length(24, 'Invalid serviceId'),
    startAt: z.string().datetime({ offset: true }),
    customerName: z.string().trim().min(1).max(120),
    // project-overview.md §6 step 8: email is optional on the public
    // booking form ("При необходимости добавляет email и комментарий").
    customerEmail: z.string().trim().email().max(254).optional(),
    customerNote: z.string().trim().max(1000).optional(),
    attachmentIds: z.array(z.string().length(24)).max(10).optional(),
  })
  .strict();
// `.strict()` matches the mass-assignment defense pattern used everywhere
// else in this codebase (companySchemas, serviceSchemas, employeeSchemas —
// per README's Stage 4/7 sections). Phone is deliberately NOT a field
// here: it comes from the verified phoneVerificationToken claim only
// (HANDOFF_1.md §6 — "Телефон в публичной брони берётся из JWT-claim
// верификационного токена, никогда из тела запроса напрямую").

export const bookingManagementTokenParamSchema = z.object({
  token: z.string().min(1),
});

export const slugAndTokenParamSchema = slugParamSchema.merge(bookingManagementTokenParamSchema);

export const reschedulePublicBookingSchema = z
  .object({
    newStartAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const cancelPublicBookingSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
