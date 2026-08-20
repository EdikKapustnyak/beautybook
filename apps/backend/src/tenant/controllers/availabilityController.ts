import { UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { mongoCompanyRepositoryPort } from '../repositories/authRepositoryAdapters.js';
import { blockedTimeRepository } from '../repositories/blockedTimeRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { serviceRepository } from '../repositories/serviceRepository.js';
import { calculateAvailableSlots, getDayBoundsUtc } from '../services/availabilityEngine.js';
import { getAvailabilityQuerySchema } from '../validation/availabilitySchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

// Same set used by bookingController.ts's recheckAvailability — a
// cancelled/no_show booking no longer occupies time; completed bookings
// are necessarily in the past for any date this endpoint would be asked
// about, but are included for consistency with the recheck logic.
const OCCUPYING_STATUSES = ['pending', 'confirmed', 'completed'] as const;

export const getAvailability = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(getAvailabilityQuerySchema, req.query);

  const company = await mongoCompanyRepositoryPort.findById(companyId);
  if (!company) {
    throw new ValidationError('Company not found.');
  }

  const service = await serviceRepository.findByIdInCompany(query.serviceId, companyId);
  if (!service) {
    throw new ValidationError('serviceId is invalid.');
  }
  if (!service.active) {
    throw new ValidationError('This service is not currently active.');
  }

  const employee = await employeeRepository.findByIdInCompany(query.employeeId, companyId);
  if (!employee) {
    throw new ValidationError('employeeId is invalid.');
  }
  if (!employee.active) {
    throw new ValidationError('This employee is not currently active.');
  }

  // Employee/service compatibility — technical-spec.md §8 step 4.
  const performsThisService = service.employeeIds.some(
    (id) => String(id) === String(employee._id),
  );
  if (!performsThisService) {
    throw new ValidationError('This employee does not perform the requested service.');
  }

  const dayBounds = getDayBoundsUtc(query.date, company.timezone);
  const [blockedDocs, existingBookings] = await Promise.all([
    blockedTimeRepository.listForEmployeeAvailability(companyId, query.employeeId, {
      from: dayBounds.start,
      to: dayBounds.end,
    }),
    bookingRepository.listInCompany(companyId, {
      page: 1,
      limit: 1000,
      employeeId: query.employeeId,
      from: dayBounds.start,
      to: dayBounds.end,
    }),
  ]);

  const occupyingBookings = existingBookings.items.filter((booking) =>
    (OCCUPYING_STATUSES as readonly string[]).includes(booking.status),
  );

  const slots = calculateAvailableSlots({
    date: query.date,
    timezone: company.timezone,
    workingHours: employee.workingHours,
    blockedIntervals: blockedDocs.map((doc) => ({ start: doc.startAt, end: doc.endAt })),
    // footprintEndAt (not endAt) so an existing booking's post-service
    // buffer is respected too — matches recheckAvailability in
    // bookingController.ts exactly, so the slots this endpoint OFFERS
    // and the slots the create/reschedule recheck actually ACCEPTS never
    // disagree with each other.
    bookedIntervals: occupyingBookings.map((booking) => ({
      start: booking.startAt,
      end: booking.footprintEndAt,
    })),
    serviceDurationMinutes: service.durationMinutes,
    serviceBufferMinutes: service.bufferMinutes,
  });

  // DTO only — no Mongo documents, no internal fields. See
  // beautybook-security-measures.md §4 and dev-tasks.md §9 "Return DTO only".
  res.status(200).json({
    success: true,
    data: {
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      })),
    },
  });
});
