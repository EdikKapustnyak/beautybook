// apps/backend/src/tenant/controllers/publicController.ts
//
// ============================================================================
// STATUS: fully confirmed against real source — apps.ts, tenant/router.ts,
// tenant/controllers/bookingController.ts, tenant/repositories/{service,
// employee,booking,blockedTime}Repository.ts, tenant/services/{otpService.
// instance,messageTemplates}.ts, tenant/models/otp.model.ts were all
// inspected this session (extracted from the uploaded project archive).
// Only one narrow point remains unconfirmed — see bottom of this header.
//
// CONFIRMED and relied on directly:
//   - asyncHandler wraps every handler — no manual try/catch/next.
//   - parseOrThrow(schema, data) validates + throws ValidationError; used
//     INSIDE the handler, never as route middleware.
//   - bookingService singleton: '../services/bookingService.instance.js'
//     (import line itself confirmed via bookingController.ts; the
//     instance file's own content failed to extract from the archive —
//     irrelevant here since only the import path/export name matter to a
//     consumer, and those are confirmed).
//   - otpService singleton: '../services/otpService.instance.js' — full
//     file content confirmed directly.
//   - OtpPurpose: the ONLY member of the union is
//     'booking_phone_verification' (tenant/models/otp.model.ts,
//     OTP_PURPOSES = ['booking_phone_verification'] as const).
//   - bookingConflictError: exported from '../services/bookingService.js'.
//   - recheckAvailability's exact data-fetching — confirmed verbatim from
//     bookingController.ts: blockedTimeRepository.listForEmployeeAvailability
//     (companyId, employeeId, { from, to }) +
//     bookingRepository.listInCompany(companyId, { page, limit, employeeId,
//     from, to }), filtered to OCCUPYING_STATUSES =
//     ['pending','confirmed','completed'], excluding the booking's own id
//     for reschedule.
//   - serviceRepository/employeeRepository.listInCompany's real options
//     shape: { page, limit, activeOnly? } — confirmed directly, no
//     client-side filtering needed.
//   - enqueueBookingNotification's exact mechanics: confirmed verbatim
//     from bookingController.ts.
//   - messageTemplates.cancellationMessage's exact signature: confirmed
//     directly — matches what was already used here.
//   - customerRepository.findByIdInCompany(customerId, companyId) — used
//     exactly this way in bookingController.ts's cancellation-notification
//     branch.
//   - Mounting: this router is NOT mounted at a bare `/public` root.
//     app.ts mounts `tenantRouter` once, at `/api/tenant`, sharing ONE
//     CORS policy (`cors({ origin: tenantCorsConfig.allowedOrigins,
//     credentials: true })`) for BOTH the authenticated tenant surface
//     AND the public surface — there is no separate open/permissive CORS
//     layer, because apps/frontend is a single Next.js app serving both
//     the public landing pages and the tenant dashboard from the same
//     origin. publicRouter mounts as `tenantRouter.use('/public',
//     publicRouter)` (see tenant/router.ts), giving the real final path
//     `/api/tenant/public/:slug/...` — NOT the bare `/public/:slug` that
//     technical-spec.md §7 shows literally. This project-wide `/api/tenant`
//     namespacing convention takes precedence over the spec doc's literal
//     path; the earlier standalone `shared/http/publicCors.ts` file this
//     session produced is unnecessary and has been removed.
//
// ⚠️ STILL UNCONFIRMED (narrow, cosmetic-only):
//   - The public booking-management LINK's URL shape
//     (`publicBookingManagementUrl` below) — project-overview.md §3 only
//     confirms the public site's base pattern
//     (`beautybook.no/{company-slug}`), not the frontend's actual
//     booking-management route once built. Treat the composed URL as a
//     placeholder to align with the real frontend route when it exists;
//     ideally the domain comes from an env var, not a hardcoded string —
//     flagged at its one usage site below.
// ============================================================================

import { DateTime } from 'luxon';

import type { WeeklySchedule } from '../../shared/validation/workingHours.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import type { NotificationJobData } from '../../shared/queue/notificationWorker.js';
import { notificationsQueue } from '../../shared/queue/queues.js';
import type { NotificationType } from '../models/notification.model.js';
import { companyRepository } from '../repositories/companyRepository.js';
import { blockedTimeRepository } from '../repositories/blockedTimeRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { customerRepository } from '../repositories/customerRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { serviceRepository } from '../repositories/serviceRepository.js';
import {
  getDayBoundsUtc,
  calculateAvailableSlots,
  isSlotAvailable,
} from '../services/availabilityEngine.js';
import { bookingConflictError } from '../services/bookingService.js';
import { bookingService } from '../services/bookingService.instance.js';
// ASSUMPTION: mirrors the confirmed bookingService.instance.js /
// notificationService.instance.js convention — see header comment.
import { otpService } from '../services/otpService.instance.js';
import { cancellationMessage } from '../services/messageTemplates.js';
import { notificationService } from '../services/notificationService.instance.js';

import {
  issuePhoneVerificationToken,
  verifyPhoneVerificationToken,
  issueBookingManagementToken,
  verifyBookingManagementToken,
} from '../../shared/security/publicBookingTokens.js';
import {
  toPublicCompanyDto,
  toPublicServiceDto,
  toPublicEmployeeDto,
} from '../../shared/dto/publicDto.js';
import {
  slugParamSchema,
  slugAndTokenParamSchema,
  publicAvailabilityQuerySchema,
  requestPhoneVerificationSchema,
  confirmPhoneVerificationSchema,
  createPublicBookingSchema,
  cancelPublicBookingSchema,
  reschedulePublicBookingSchema,
} from '../validation/publicSchemas.js';

// CONFIRMED by typecheck: otpService.requestOtp/.verifyOtp's `purpose`
// parameter only accepts the literal 'booking_phone_verification' — i.e.
// OtpPurpose currently has exactly one member, matching Stage 15 README's
// note that OTP's only real consumer is this exact public phone-verification
// step. My earlier guess ('public_booking') was wrong; TS's error message
// gave the real value directly.
const PUBLIC_BOOKING_OTP_PURPOSE = 'booking_phone_verification' as const;

const OCCUPYING_STATUSES = ['pending', 'confirmed', 'completed'] as const;

/**
 * Resolves a public slug to an ACTIVE company, or throws a generic 404.
 * The single chokepoint every public handler must go through first —
 * mirrors companyRepository.findBySlug's own "one sanctioned place" note
 * (HANDOFF_1.md §5) and enforces anti-enumeration (HANDOFF_1.md §6):
 * draft, suspended, and nonexistent companies are indistinguishable to the
 * caller. Deliberately NotFoundError (404), not ValidationError — unlike
 * bookingController.ts's authenticated findById-by-JWT-claim case (where a
 * missing company is an unexpected server-side inconsistency), a
 * nonexistent/inactive slug on the PUBLIC surface is an expected,
 * anti-enumeration-sensitive outcome.
 */
async function resolveActivePublicCompany(slug: string) {
  const company = await companyRepository.findBySlug(slug);
  if (!company || company.status !== 'active') {
    throw new NotFoundError('Company not found.');
  }
  return company;
}

/**
 * Fetches blocked + booked intervals for one employee on one calendar date
 * (UTC bounds), in the shape both calculateAvailableSlots and
 * isSlotAvailable expect. Data-fetching copied verbatim from
 * bookingController.ts's recheckAvailability — see header comment.
 */
async function fetchOccupiedIntervals(
  companyId: string,
  employeeId: string,
  dayBounds: { start: Date; end: Date },
  excludeBookingId?: string,
) {
  const [blockedDocs, existingBookings] = await Promise.all([
    blockedTimeRepository.listForEmployeeAvailability(companyId, employeeId, {
      from: dayBounds.start,
      to: dayBounds.end,
    }),
    bookingRepository.listInCompany(companyId, {
      page: 1,
      limit: 1000,
      employeeId,
      from: dayBounds.start,
      to: dayBounds.end,
    }),
  ]);

  const occupyingBookings = existingBookings.items.filter(
    (booking) =>
      (OCCUPYING_STATUSES as readonly string[]).includes(booking.status) &&
      String(booking._id) !== excludeBookingId,
  );

  return {
    blockedIntervals: blockedDocs.map((doc) => ({ start: doc.startAt, end: doc.endAt })),
    bookedIntervals: occupyingBookings.map((booking) => ({
      start: booking.startAt,
      end: booking.footprintEndAt,
    })),
  };
}

/**
 * Server-side availability RECHECK for the public booking flow — same
 * function as bookingController.ts's recheckAvailability, duplicated here
 * (rather than imported/exported) because it isn't currently exported from
 * that file. If it later gets extracted to a shared module, this local
 * copy should be deleted in favor of the import.
 */
async function recheckAvailability(input: {
  companyId: string;
  employeeId: string;
  timezone: string;
  workingHours: WeeklySchedule;
  bufferMinutes: number;
  requestedStart: Date;
  requestedEnd: Date;
  excludeBookingId?: string;
}): Promise<boolean> {
  const dateInCompanyTz = DateTime.fromJSDate(input.requestedStart, { zone: input.timezone });
  if (!dateInCompanyTz.isValid) {
    throw new ValidationError('Could not resolve the requested date in the company timezone.');
  }
  const date = dateInCompanyTz.toISODate();
  if (!date) {
    throw new ValidationError('Could not resolve the requested date in the company timezone.');
  }

  const dayBounds = getDayBoundsUtc(date, input.timezone);
  const { blockedIntervals, bookedIntervals } = await fetchOccupiedIntervals(
    input.companyId,
    input.employeeId,
    dayBounds,
    input.excludeBookingId,
  );

  return isSlotAvailable({
    requestedStart: input.requestedStart,
    requestedEnd: input.requestedEnd,
    date,
    timezone: input.timezone,
    workingHours: input.workingHours,
    blockedIntervals,
    bookedIntervals,
    serviceBufferMinutes: input.bufferMinutes,
  });
}

/**
 * Enqueues a notification for background sending. Mechanics copied
 * verbatim from bookingController.ts's enqueueBookingNotification —
 * deliberately best-effort (logs, never throws) so a notification failure
 * can never turn a successful public booking mutation into an error
 * response.
 */
async function enqueuePublicBookingNotification(input: {
  companyId: string;
  bookingId: string;
  type: NotificationType;
  recipient: string;
  body: string;
}): Promise<void> {
  try {
    const notification = await notificationService.enqueue(input.companyId, {
      bookingId: input.bookingId,
      type: input.type,
      recipient: input.recipient,
      body: input.body,
      dedupeKey: `${input.bookingId}:${input.type}`,
      scheduledAt: new Date(),
    });
    const jobData: NotificationJobData = { notificationId: notification.id };
    await notificationsQueue.add('send-notification', jobData, {
      jobId: `send-${notification.id}`,
    });
  } catch (error) {
    console.error(`Failed to enqueue ${input.type} notification:`, error);
  }
}

/**
 * ASSUMPTION: placeholder URL shape for the "manage your booking" link —
 * see header comment. Ideally the base domain comes from an env var
 * (e.g. PUBLIC_SITE_BASE_URL) rather than being hardcoded; using
 * project-overview.md §3's stated pattern here as a stand-in until the
 * real frontend route exists.
 */
function publicBookingManagementUrl(companySlug: string, managementToken: string): string {
  return `https://beautybook.no/${companySlug}/manage-booking/${managementToken}`;
}

export const getPublicCompany = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const company = await resolveActivePublicCompany(slug);
  res.status(200).json({ success: true, data: { company: toPublicCompanyDto(company) } });
});

export const getPublicServices = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const company = await resolveActivePublicCompany(slug);
  // CONFIRMED (real serviceRepository.ts): ListServicesOptions is
  // { page, limit, activeOnly? } — the built-in `activeOnly` flag makes
  // client-side filtering unnecessary.
  const services = await serviceRepository.listInCompany(String(company._id), {
    page: 1,
    limit: 100,
    activeOnly: true,
  });
  res.status(200).json({
    success: true,
    data: { services: services.items.map(toPublicServiceDto) },
  });
});

export const getPublicEmployees = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const company = await resolveActivePublicCompany(slug);
  // Same confirmed activeOnly flag as getPublicServices above.
  const employees = await employeeRepository.listInCompany(String(company._id), {
    page: 1,
    limit: 100,
    activeOnly: true,
  });
  res.status(200).json({
    success: true,
    data: { employees: employees.items.map(toPublicEmployeeDto) },
  });
});

export const getPublicAvailability = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const { employeeId, serviceId, date } = parseOrThrow(publicAvailabilityQuerySchema, req.query);
  const company = await resolveActivePublicCompany(slug);

  const employee = await employeeRepository.findByIdInCompany(employeeId, String(company._id));
  if (!employee) {
    throw new ValidationError('employeeId is invalid.');
  }
  if (!employee.active) {
    throw new ValidationError('This employee is not currently active.');
  }
  const service = await serviceRepository.findByIdInCompany(serviceId, String(company._id));
  if (!service) {
    throw new ValidationError('serviceId is invalid.');
  }
  if (!service.active) {
    throw new ValidationError('This service is not currently active.');
  }
  const performsThisService = service.employeeIds.some((id) => String(id) === String(employee._id));
  if (!performsThisService) {
    throw new ValidationError('This employee does not perform the requested service.');
  }

  const dayBounds = getDayBoundsUtc(date, company.timezone);
  const { blockedIntervals, bookedIntervals } = await fetchOccupiedIntervals(
    String(company._id),
    String(employee._id),
    dayBounds,
  );

  const slots = calculateAvailableSlots({
    date,
    timezone: company.timezone,
    workingHours: employee.workingHours,
    blockedIntervals,
    bookedIntervals,
    serviceDurationMinutes: service.durationMinutes,
    serviceBufferMinutes: service.bufferMinutes,
  });

  res.status(200).json({ success: true, data: { slots } });
});

export const requestPhoneVerification = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const { phone } = parseOrThrow(requestPhoneVerificationSchema, req.body);
  const company = await resolveActivePublicCompany(slug);

  await otpService.requestOtp(String(company._id), phone, PUBLIC_BOOKING_OTP_PURPOSE);

  // Generic response regardless of anything about this phone — matches
  // otpService.requestOtp's own "no does-this-phone-exist branch" design
  // note (anti-enumeration, security-measures.md §30).
  res.status(200).json({ success: true, data: { sent: true } });
});

export const confirmPhoneVerification = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const { phone, code } = parseOrThrow(confirmPhoneVerificationSchema, req.body);
  const company = await resolveActivePublicCompany(slug);

  // Throws (UnauthorizedError, per otpService.ts) on any failure —
  // wrong/expired/reused code, lockout. asyncHandler forwards it.
  await otpService.verifyOtp(String(company._id), phone, PUBLIC_BOOKING_OTP_PURPOSE, code);

  const phoneVerificationToken = issuePhoneVerificationToken({ phone });
  res.status(200).json({ success: true, data: { phoneVerificationToken } });
});

export const createPublicBooking = asyncHandler(async (req, res) => {
  const { slug } = parseOrThrow(slugParamSchema, req.params);
  const input = parseOrThrow(createPublicBookingSchema, req.body);
  const company = await resolveActivePublicCompany(slug);

  // Phone comes ONLY from the verified token — never from the body.
  // Architectural decision, HANDOFF_1.md §6.
  const { phone } = verifyPhoneVerificationToken(input.phoneVerificationToken);

  const service = await serviceRepository.findByIdInCompany(input.serviceId, String(company._id));
  if (!service) {
    throw new ValidationError('serviceId is invalid.');
  }
  if (!service.active) {
    throw new ValidationError('This service is not currently active.');
  }

  const employee = await employeeRepository.findByIdInCompany(
    input.employeeId,
    String(company._id),
  );
  if (!employee) {
    throw new ValidationError('employeeId is invalid.');
  }
  if (!employee.active) {
    throw new ValidationError('This employee is not currently active.');
  }

  const performsThisService = service.employeeIds.some((id) => String(id) === String(employee._id));
  if (!performsThisService) {
    throw new ValidationError('This employee does not perform the requested service.');
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  const available = await recheckAvailability({
    companyId: String(company._id),
    employeeId: input.employeeId,
    timezone: company.timezone,
    workingHours: employee.workingHours,
    bufferMinutes: service.bufferMinutes,
    requestedStart: startAt,
    requestedEnd: endAt,
  });
  if (!available) {
    throw bookingConflictError();
  }

  const booking = await bookingService.createBooking({
    companyId: String(company._id),
    employeeId: input.employeeId,
    serviceId: input.serviceId,
    startAt,
    endAt,
    bufferMinutes: service.bufferMinutes,
    customer: { name: input.customerName, phone, email: input.customerEmail },
    customerNote: input.customerNote,
  });

  const bookingManagementToken = issueBookingManagementToken({ bookingId: booking.id });

  await enqueuePublicBookingNotification({
    companyId: String(company._id),
    bookingId: booking.id,
    type: 'booking_confirmation',
    recipient: phone,
    // ASSUMPTION: composed locally rather than via messageTemplates.ts's
    // bookingConfirmationMessage (which doesn't take a link param) —
    // consider moving this into messageTemplates.ts as a dedicated
    // `publicBookingConfirmationMessage` once the real frontend
    // management-link URL shape is settled, for consistency with the
    // tenant flow's message-building convention.
    body: `Your booking at ${company.name} for ${service.name} is confirmed for ${booking.startAt.toISOString()}. Manage it here: ${publicBookingManagementUrl(company.slug, bookingManagementToken)}`,
  });

  res.status(201).json({
    success: true,
    data: {
      bookingId: booking.id,
      status: booking.status,
      startAt: booking.startAt,
      bookingManagementToken,
    },
  });
});

export const cancelPublicBooking = asyncHandler(async (req, res) => {
  const { slug, token } = parseOrThrow(slugAndTokenParamSchema, req.params);
  const { reason } = parseOrThrow(cancelPublicBookingSchema, req.body);
  const company = await resolveActivePublicCompany(slug);

  const { bookingId } = verifyBookingManagementToken(token);

  const booking = await bookingService.updateStatus({
    companyId: String(company._id),
    bookingId,
    newStatus: 'cancelled',
    cancellationReason: reason,
  });

  const [service, customer] = await Promise.all([
    serviceRepository.findByIdInCompany(String(booking.serviceId), String(company._id)),
    customerRepository.findByIdInCompany(booking.customerId, String(company._id)),
  ]);
  if (service && customer) {
    await enqueuePublicBookingNotification({
      companyId: String(company._id),
      bookingId: booking.id,
      type: 'cancellation',
      recipient: customer.phone,
      body: cancellationMessage({
        companyName: company.name,
        serviceName: service.name,
        startAt: booking.startAt,
        timezone: company.timezone,
      }),
    });
  }

  res.status(200).json({ success: true, data: { status: booking.status } });
});

export const reschedulePublicBooking = asyncHandler(async (req, res) => {
  const { slug, token } = parseOrThrow(slugAndTokenParamSchema, req.params);
  const { newStartAt } = parseOrThrow(reschedulePublicBookingSchema, req.body);
  const company = await resolveActivePublicCompany(slug);

  const { bookingId } = verifyBookingManagementToken(token);

  const existing = await bookingRepository.findByIdInCompany(bookingId, String(company._id));
  if (!existing) {
    throw new NotFoundError('Booking not found.');
  }

  const [service, employee] = await Promise.all([
    serviceRepository.findByIdInCompany(String(existing.serviceId), String(company._id)),
    employeeRepository.findByIdInCompany(String(existing.employeeId), String(company._id)),
  ]);
  if (!service || !employee) {
    throw new ValidationError('Could not resolve service/employee for this booking.');
  }

  const newStart = new Date(newStartAt);
  const newEnd = new Date(newStart.getTime() + service.durationMinutes * 60_000);

  const available = await recheckAvailability({
    companyId: String(company._id),
    employeeId: String(existing.employeeId),
    timezone: company.timezone,
    workingHours: employee.workingHours,
    bufferMinutes: service.bufferMinutes,
    requestedStart: newStart,
    requestedEnd: newEnd,
    excludeBookingId: bookingId,
  });
  if (!available) {
    throw bookingConflictError();
  }

  const booking = await bookingService.rescheduleBooking({
    companyId: String(company._id),
    bookingId,
    newStartAt: newStart,
    newEndAt: newEnd,
    bufferMinutes: service.bufferMinutes,
  });

  res
    .status(200)
    .json({ success: true, data: { status: booking.status, startAt: booking.startAt } });
});
