import type { BookingStatus } from '../models/booking.model.js';
import type {
  BookingRecord,
  BookingRepositoryPort,
  CustomerRepositoryPort,
  SlotLockRepositoryPort,
} from '../repositories/bookingTypes.js';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import type { ReminderSchedulerPort } from './reminderSchedulerPort.js';
import { computeSlotCellKeys } from './slotLocking.js';

export interface BookingServiceDeps {
  bookingRepo: BookingRepositoryPort;
  slotLockRepo: SlotLockRepositoryPort;
  customerRepo: CustomerRepositoryPort;
  /**
   * Optional so existing/simpler tests don't need to stub it — reminder
   * scheduling is a best-effort secondary concern (see
   * `safeScheduleReminders`/`safeCancelReminders` below), never something
   * that should block or fail a booking mutation.
   */
  reminderScheduler?: ReminderSchedulerPort;
}

export interface CreateBookingInput {
  companyId: string;
  employeeId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
  customer: { name: string; phone: string; email?: string };
  customerNote?: string;
  internalNote?: string;
  createdByUserId?: string;
}

/**
 * technical-spec.md §18's example error shape for exactly this situation:
 * `{ "success": false, "error": { "code": "BOOKING_CONFLICT", ... } }`.
 */
export function bookingConflictError(): AppError {
  return new AppError(409, 'BOOKING_CONFLICT', 'The selected time is no longer available.');
}

// pending -> confirmed | cancelled
// confirmed -> completed | cancelled | no_show
// (completed/cancelled/no_show/expired are terminal — no transitions out)
const ALLOWED_FROM_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  pending: [],
  confirmed: ['pending'],
  completed: ['confirmed'],
  cancelled: ['pending', 'confirmed'],
  no_show: ['confirmed'],
  expired: [],
};

// Only non-terminal bookings can be rescheduled or have their status
// changed further — matches ALLOWED_FROM_STATUSES' notion of "still open".
const RESCHEDULABLE_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

export function createBookingService(deps: BookingServiceDeps) {
  const { bookingRepo, slotLockRepo, customerRepo, reminderScheduler } = deps;

  /**
   * A Redis/BullMQ outage must never break booking creation, cancellation,
   * or reschedule — reminders are a secondary concern layered on top of
   * the booking's own correctness, not a precondition for it. Errors are
   * swallowed here deliberately (not silently ignored: still logged) so
   * the caller never even sees them.
   */
  async function safeScheduleReminders(input: {
    companyId: string;
    bookingId: string;
    startAt: Date;
  }): Promise<void> {
    if (!reminderScheduler) {
      return;
    }
    try {
      await reminderScheduler.scheduleReminders(input);
    } catch (error) {
      console.error('Failed to schedule booking reminders:', error);
    }
  }

  async function safeCancelReminders(bookingId: string): Promise<void> {
    if (!reminderScheduler) {
      return;
    }
    try {
      await reminderScheduler.cancelReminders(bookingId);
    } catch (error) {
      console.error('Failed to cancel booking reminders:', error);
    }
  }

  return {
    /**
     * Reserve-before-create: the SlotLock reservation happens BEFORE the
     * Booking document exists. If the reservation loses the race, nothing
     * was ever created and there's nothing to roll back — this is what
     * makes the function safe under concurrency without needing a
     * multi-document transaction. See slotLock.model.ts.
     *
     * The caller (controller) is expected to have already run
     * `isSlotAvailable` as a fast-path availability recheck — see
     * availabilityEngine.ts — but that check alone does NOT prevent a
     * race between two concurrent requests; this reservation step does.
     */
    async createBooking(input: CreateBookingInput): Promise<BookingRecord> {
      const footprintEndAt = new Date(input.endAt.getTime() + input.bufferMinutes * 60_000);
      const bookingId = bookingRepo.generateId();
      const cellKeys = computeSlotCellKeys(input.startAt, footprintEndAt);

      const reserved = await slotLockRepo.reserve(input.employeeId, cellKeys, bookingId);
      if (!reserved) {
        throw bookingConflictError();
      }

      const customer = await customerRepo.findOrCreate(input.companyId, input.customer);

      const booking = await bookingRepo.create({
        id: bookingId,
        companyId: input.companyId,
        employeeId: input.employeeId,
        customerId: customer.id,
        serviceId: input.serviceId,
        startAt: input.startAt,
        endAt: input.endAt,
        footprintEndAt,
        status: 'confirmed',
        customerNote: input.customerNote,
        internalNote: input.internalNote,
        createdByUserId: input.createdByUserId,
      });

      // Denormalized CRM counters (dev-tasks.md §12) — best-effort, does
      // not affect whether the booking itself succeeded.
      await customerRepo.recordBooking(customer.id, input.startAt);

      await safeScheduleReminders({
        companyId: input.companyId,
        bookingId: booking.id,
        startAt: input.startAt,
      });

      return booking;
    },

    /**
     * Moves an existing booking to a new time, keeping the same employee
     * and service (dev-tasks.md §11 "Reschedule" — reassigning to a
     * different staff member is out of scope here; cancel + rebook covers
     * that case). Only the CELL DELTA is touched: new cells are reserved
     * first (still safe under concurrency — same reserve-before-mutate
     * principle as createBooking), and only cells no longer needed are
     * released, never the whole lock set — otherwise a reschedule could
     * transiently leave the booking with no reservation at all.
     */
    async rescheduleBooking(input: {
      companyId: string;
      bookingId: string;
      newStartAt: Date;
      newEndAt: Date;
      bufferMinutes: number;
    }): Promise<BookingRecord> {
      const existing = await bookingRepo.findByIdInCompany(input.bookingId, input.companyId);
      if (!existing) {
        throw new NotFoundError('Booking not found.');
      }
      if (!RESCHEDULABLE_STATUSES.includes(existing.status)) {
        throw new ConflictError(`Cannot reschedule a booking with status "${existing.status}".`);
      }

      const newFootprintEndAt = new Date(input.newEndAt.getTime() + input.bufferMinutes * 60_000);
      const oldCellKeys = computeSlotCellKeys(existing.startAt, existing.footprintEndAt);
      const newCellKeys = computeSlotCellKeys(input.newStartAt, newFootprintEndAt);
      const oldCellKeySet = new Set(oldCellKeys);
      const newCellKeySet = new Set(newCellKeys);

      const cellsToReserve = newCellKeys.filter((key) => !oldCellKeySet.has(key));
      const cellsToRelease = oldCellKeys.filter((key) => !newCellKeySet.has(key));

      const reserved = await slotLockRepo.reserve(
        existing.employeeId,
        cellsToReserve,
        input.bookingId,
      );
      if (!reserved) {
        throw bookingConflictError();
      }

      if (cellsToRelease.length > 0) {
        await slotLockRepo.releaseCells(input.bookingId, cellsToRelease);
      }

      const updated = await bookingRepo.updateFieldsInCompany(input.bookingId, input.companyId, {
        startAt: input.newStartAt,
        endAt: input.newEndAt,
        footprintEndAt: newFootprintEndAt,
      });
      if (!updated) {
        throw new NotFoundError('Booking not found.');
      }

      // Cancel old-time reminders and schedule fresh ones for the new
      // time — dev-tasks.md §17 "Reschedule reminder if booking moved".
      await safeCancelReminders(input.bookingId);
      await safeScheduleReminders({
        companyId: input.companyId,
        bookingId: input.bookingId,
        startAt: input.newStartAt,
      });

      return updated;
    },

    async updateNotes(input: {
      companyId: string;
      bookingId: string;
      customerNote?: string;
      internalNote?: string;
    }): Promise<BookingRecord> {
      const updated = await bookingRepo.updateFieldsInCompany(input.bookingId, input.companyId, {
        customerNote: input.customerNote,
        internalNote: input.internalNote,
      });
      if (!updated) {
        throw new NotFoundError('Booking not found.');
      }
      return updated;
    },

    async updateStatus(input: {
      companyId: string;
      bookingId: string;
      newStatus: BookingStatus;
      cancellationReason?: string;
    }): Promise<BookingRecord> {
      const allowedFrom = ALLOWED_FROM_STATUSES[input.newStatus];
      if (allowedFrom.length === 0) {
        throw new ConflictError(`Cannot transition a booking to "${input.newStatus}".`);
      }

      const updated = await bookingRepo.updateStatusIfCurrentIn(
        input.bookingId,
        input.companyId,
        allowedFrom,
        input.newStatus,
        { cancellationReason: input.cancellationReason },
      );

      if (!updated) {
        const existing = await bookingRepo.findByIdInCompany(input.bookingId, input.companyId);
        if (!existing) {
          throw new NotFoundError('Booking not found.');
        }
        throw new ConflictError(
          `Cannot transition booking from "${existing.status}" to "${input.newStatus}".`,
        );
      }

      // Cancelling/no-showing frees the slot back up for other bookings,
      // AND cancels any pending reminders — dev-tasks.md §17 "Cancel
      // reminder if booking cancelled".
      if (input.newStatus === 'cancelled' || input.newStatus === 'no_show') {
        await slotLockRepo.release(input.bookingId);
        await safeCancelReminders(input.bookingId);
      }

      return updated;
    },
  };
}

export type BookingService = ReturnType<typeof createBookingService>;
