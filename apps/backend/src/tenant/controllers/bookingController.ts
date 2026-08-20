import { DateTime } from 'luxon';
import { isValidObjectId } from 'mongoose';

import type { WeeklySchedule } from '../../shared/validation/workingHours.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import type { NotificationJobData } from '../../shared/queue/notificationWorker.js';
import { notificationsQueue } from '../../shared/queue/queues.js';
import type { NotificationType } from '../models/notification.model.js';
import { mongoCompanyRepositoryPort } from '../repositories/authRepositoryAdapters.js';
import { blockedTimeRepository } from '../repositories/blockedTimeRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { customerRepository } from '../repositories/customerRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { serviceRepository } from '../repositories/serviceRepository.js';
import { getDayBoundsUtc, isSlotAvailable } from '../services/availabilityEngine.js';
import { bookingConflictError } from '../services/bookingService.js';
import { bookingService } from '../services/bookingService.instance.js';
import { bookingConfirmationMessage, cancellationMessage } from '../services/messageTemplates.js';
import { notificationService } from '../services/notificationService.instance.js';
import {
  createBookingSchema,
  listBookingsQuerySchema,
  rescheduleBookingSchema,
  updateBookingNotesSchema,
  updateBookingStatusSchema,
} from '../validation/bookingSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

/**
 * Enqueues a notification for background sending — creates the durable
 * (idempotent-by-dedupeKey) Notification record via notificationService,
 * then hands the actual SMS delivery off to the notifications queue
 * worker rather than sending inline, so a slow/failing SMS provider never
 * adds latency or failure risk to the HTTP response. Deliberately
 * best-effort: a failure here is logged, never thrown, so it can't turn a
 * successful booking mutation into an error response — same resilience
 * principle as bookingService's reminder scheduling.
 */
async function enqueueBookingNotification(input: {
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

const OCCUPYING_STATUSES = ['pending', 'confirmed', 'completed'] as const;

/**
 * Server-side availability RECHECK — technical-spec.md §8: never trust a
 * slot list the frontend fetched earlier. Shared by create and reschedule.
 * This is the fast/friendly path; the actual race-condition guarantee is
 * the atomic SlotLock reservation inside bookingService.
 *
 * `excludeBookingId` is used by reschedule: the booking being moved
 * currently occupies its OLD time, which must not count as a conflict
 * against itself when checking room at a NEW time.
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
  const [blockedDocs, existingBookings] = await Promise.all([
    blockedTimeRepository.listForEmployeeAvailability(input.companyId, input.employeeId, {
      from: dayBounds.start,
      to: dayBounds.end,
    }),
    bookingRepository.listInCompany(input.companyId, {
      page: 1,
      limit: 1000,
      employeeId: input.employeeId,
      from: dayBounds.start,
      to: dayBounds.end,
    }),
  ]);

  const occupyingBookings = existingBookings.items.filter(
    (booking) =>
      (OCCUPYING_STATUSES as readonly string[]).includes(booking.status) &&
      String(booking._id) !== input.excludeBookingId,
  );

  return isSlotAvailable({
    requestedStart: input.requestedStart,
    requestedEnd: input.requestedEnd,
    date,
    timezone: input.timezone,
    workingHours: input.workingHours,
    blockedIntervals: blockedDocs.map((doc) => ({ start: doc.startAt, end: doc.endAt })),
    bookedIntervals: occupyingBookings.map((booking) => ({
      start: booking.startAt,
      end: booking.footprintEndAt,
    })),
    serviceBufferMinutes: input.bufferMinutes,
  });
}

export const createBooking = asyncHandler(async (req, res) => {
  const { companyId, userId } = requireAuth(req.tenantAuth);
  const input = parseOrThrow(createBookingSchema, req.body);

  const company = await mongoCompanyRepositoryPort.findById(companyId);
  if (!company) {
    throw new ValidationError('Company not found.');
  }

  const service = await serviceRepository.findByIdInCompany(input.serviceId, companyId);
  if (!service) {
    throw new ValidationError('serviceId is invalid.');
  }
  if (!service.active) {
    throw new ValidationError('This service is not currently active.');
  }

  const employee = await employeeRepository.findByIdInCompany(input.employeeId, companyId);
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

  const endAt = new Date(input.startAt.getTime() + service.durationMinutes * 60_000);

  const available = await recheckAvailability({
    companyId,
    employeeId: input.employeeId,
    timezone: company.timezone,
    workingHours: employee.workingHours,
    bufferMinutes: service.bufferMinutes,
    requestedStart: input.startAt,
    requestedEnd: endAt,
  });

  if (!available) {
    throw bookingConflictError();
  }

  const booking = await bookingService.createBooking({
    companyId,
    employeeId: input.employeeId,
    serviceId: input.serviceId,
    startAt: input.startAt,
    endAt,
    bufferMinutes: service.bufferMinutes,
    customer: input.customer,
    customerNote: input.customerNote,
    internalNote: input.internalNote,
    createdByUserId: userId,
  });

  await enqueueBookingNotification({
    companyId,
    bookingId: booking.id,
    type: 'booking_confirmation',
    recipient: input.customer.phone,
    body: bookingConfirmationMessage({
      companyName: company.name,
      serviceName: service.name,
      startAt: booking.startAt,
      timezone: company.timezone,
    }),
  });

  res.status(201).json({ success: true, data: { booking } });
});

export const listBookings = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(listBookingsQuerySchema, req.query);

  const { items, total } = await bookingRepository.listInCompany(companyId, query);
  res.status(200).json({
    success: true,
    data: { bookings: items, pagination: { page: query.page, limit: query.limit, total } },
  });
});

export const getBooking = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid booking id.');
  }

  const booking = await bookingRepository.findByIdInCompany(id, companyId);
  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }
  res.status(200).json({ success: true, data: { booking } });
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid booking id.');
  }

  const input = parseOrThrow(updateBookingStatusSchema, req.body);
  const booking = await bookingService.updateStatus({
    companyId,
    bookingId: id,
    newStatus: input.status,
    cancellationReason: input.cancellationReason,
  });

  if (input.status === 'cancelled') {
    const [company, service, customer] = await Promise.all([
      mongoCompanyRepositoryPort.findById(companyId),
      serviceRepository.findByIdInCompany(String(booking.serviceId), companyId),
      customerRepository.findByIdInCompany(booking.customerId, companyId),
    ]);
    if (company && service && customer) {
      await enqueueBookingNotification({
        companyId,
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
  }

  res.status(200).json({ success: true, data: { booking } });
});

export const rescheduleBooking = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid booking id.');
  }

  const input = parseOrThrow(rescheduleBookingSchema, req.body);

  const existing = await bookingRepository.findByIdInCompany(id, companyId);
  if (!existing) {
    throw new NotFoundError('Booking not found.');
  }

  const [company, service, employee] = await Promise.all([
    mongoCompanyRepositoryPort.findById(companyId),
    serviceRepository.findByIdInCompany(String(existing.serviceId), companyId),
    employeeRepository.findByIdInCompany(String(existing.employeeId), companyId),
  ]);
  if (!company || !service || !employee) {
    throw new ValidationError('Could not resolve company/service/employee for this booking.');
  }

  const newEndAt = new Date(input.startAt.getTime() + service.durationMinutes * 60_000);

  const available = await recheckAvailability({
    companyId,
    employeeId: String(existing.employeeId),
    timezone: company.timezone,
    workingHours: employee.workingHours,
    bufferMinutes: service.bufferMinutes,
    requestedStart: input.startAt,
    requestedEnd: newEndAt,
    excludeBookingId: id,
  });

  if (!available) {
    throw bookingConflictError();
  }

  const booking = await bookingService.rescheduleBooking({
    companyId,
    bookingId: id,
    newStartAt: input.startAt,
    newEndAt,
    bufferMinutes: service.bufferMinutes,
  });

  res.status(200).json({ success: true, data: { booking } });
});

export const updateBookingNotes = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid booking id.');
  }

  const input = parseOrThrow(updateBookingNotesSchema, req.body);
  const booking = await bookingService.updateNotes({
    companyId,
    bookingId: id,
    customerNote: input.customerNote,
    internalNote: input.internalNote,
  });

  res.status(200).json({ success: true, data: { booking } });
});
