import type { BookingStatus } from '../models/booking.model.js';

export interface BookingRecord {
  id: string;
  companyId: string;
  employeeId: string;
  customerId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  footprintEndAt: Date;
  status: BookingStatus;
  customerNote?: string;
  internalNote?: string;
  cancellationReason?: string;
}

export interface CustomerRecord {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email?: string;
}

export interface BookingRepositoryPort {
  /** Pre-generates an id so SlotLock rows can reference it BEFORE the booking document itself is created. */
  generateId(): string;
  create(data: {
    id: string;
    companyId: string;
    employeeId: string;
    customerId: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
    footprintEndAt: Date;
    status: BookingStatus;
    customerNote?: string;
    internalNote?: string;
    createdByUserId?: string;
  }): Promise<BookingRecord>;
  findByIdInCompany(id: string, companyId: string): Promise<BookingRecord | null>;
  /**
   * Atomic conditional status transition — only succeeds if the booking's
   * CURRENT status is one of `allowedFromStatuses`. Returns null if the
   * booking doesn't exist OR the transition wasn't valid from its current
   * status (the caller disambiguates with a follow-up read if it needs a
   * more specific error message).
   */
  updateStatusIfCurrentIn(
    bookingId: string,
    companyId: string,
    allowedFromStatuses: BookingStatus[],
    newStatus: BookingStatus,
    extra?: { cancellationReason?: string },
  ): Promise<BookingRecord | null>;
  /**
   * Plain field update — used for reschedule (startAt/endAt/footprintEndAt)
   * and for editing customer/internal notes. No status/concurrency
   * semantics of its own; callers that need atomicity (reschedule) get it
   * from the SlotLock reservation happening first, not from this method.
   */
  updateFieldsInCompany(
    bookingId: string,
    companyId: string,
    updates: Partial<
      Pick<BookingRecord, 'startAt' | 'endAt' | 'footprintEndAt' | 'customerNote' | 'internalNote'>
    >,
  ): Promise<BookingRecord | null>;
}

export interface CustomerRepositoryPort {
  findOrCreate(
    companyId: string,
    data: { name: string; phone: string; email?: string },
  ): Promise<CustomerRecord>;
  /** Keeps the denormalized totalBookings/lastBookingAt counters current — see customerRepository.recordBooking. */
  recordBooking(customerId: string, bookingDate: Date): Promise<void>;
}

export interface SlotLockRepositoryPort {
  /**
   * Attempts to atomically claim every cell in `cellKeys` for `employeeId`.
   * Returns true if ALL cells were claimed (no conflict), false if ANY
   * cell was already locked by another booking (any partial claims from
   * this attempt are released before returning). This — not application
   * logic — is what actually prevents double-booking; see
   * slotLock.model.ts.
   */
  reserve(employeeId: string, cellKeys: string[], bookingId: string): Promise<boolean>;
  /** Frees every cell locked by this booking (called on cancel/no-show). */
  release(bookingId: string): Promise<void>;
  /**
   * Frees ONLY the given cells locked by this booking — used by reschedule,
   * which must NOT release the newly-reserved cells that share the same
   * bookingId. See bookingService.rescheduleBooking.
   */
  releaseCells(bookingId: string, cellKeys: string[]): Promise<void>;
}
