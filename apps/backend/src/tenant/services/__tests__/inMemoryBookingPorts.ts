import { randomUUID } from 'node:crypto';

import type {
  BookingRecord,
  BookingRepositoryPort,
  CustomerRecord,
  CustomerRepositoryPort,
  SlotLockRepositoryPort,
} from '../../repositories/bookingTypes.js';

export function createInMemoryBookingRepo(): BookingRepositoryPort {
  const bookings = new Map<string, BookingRecord>();
  return {
    generateId() {
      return randomUUID();
    },
    async create(data) {
      const record: BookingRecord = { ...data };
      bookings.set(record.id, record);
      return record;
    },
    async findByIdInCompany(id, companyId) {
      const booking = bookings.get(id);
      return booking && booking.companyId === companyId ? booking : null;
    },
    async updateStatusIfCurrentIn(bookingId, companyId, allowedFromStatuses, newStatus, extra) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.companyId !== companyId) {
        return null;
      }
      if (!allowedFromStatuses.includes(booking.status)) {
        return null;
      }
      const updated: BookingRecord = {
        ...booking,
        status: newStatus,
        cancellationReason: extra?.cancellationReason ?? booking.cancellationReason,
      };
      bookings.set(bookingId, updated);
      return updated;
    },
    async updateFieldsInCompany(bookingId, companyId, updates) {
      const booking = bookings.get(bookingId);
      if (!booking || booking.companyId !== companyId) {
        return null;
      }
      const updated: BookingRecord = { ...booking, ...updates };
      bookings.set(bookingId, updated);
      return updated;
    },
  };
}

export function createInMemoryCustomerRepo(): CustomerRepositoryPort {
  const customers = new Map<string, CustomerRecord>();
  const bookingCounts = new Map<string, { totalBookings: number; lastBookingAt: Date }>();
  return {
    async findOrCreate(companyId, data) {
      const existing = [...customers.values()].find(
        (c) => c.companyId === companyId && c.phone === data.phone,
      );
      if (existing) {
        return existing;
      }
      const record: CustomerRecord = { id: randomUUID(), companyId, ...data };
      customers.set(record.id, record);
      return record;
    },
    async recordBooking(customerId, bookingDate) {
      const current = bookingCounts.get(customerId);
      bookingCounts.set(customerId, {
        totalBookings: (current?.totalBookings ?? 0) + 1,
        lastBookingAt: bookingDate,
      });
    },
  };
}

/**
 * Enforces the SAME uniqueness constraint a real MongoDB unique index on
 * (employeeId, cellKey) would — this is what lets these tests genuinely
 * exercise the conflict-handling branch of bookingService, not just
 * happy-path plumbing.
 */
export function createInMemorySlotLockRepo(): SlotLockRepositoryPort {
  const locks = new Map<string, { bookingId: string; cellKey: string }>(); // `${employeeId}:${cellKey}` -> owner
  return {
    async reserve(employeeId, cellKeys, bookingId) {
      const claimedThisAttempt: string[] = [];
      for (const cellKey of cellKeys) {
        const lockKey = `${employeeId}:${cellKey}`;
        if (locks.has(lockKey)) {
          for (const key of claimedThisAttempt) {
            locks.delete(key);
          }
          return false;
        }
        locks.set(lockKey, { bookingId, cellKey });
        claimedThisAttempt.push(lockKey);
      }
      return true;
    },
    async release(bookingId) {
      for (const [key, owner] of locks.entries()) {
        if (owner.bookingId === bookingId) {
          locks.delete(key);
        }
      }
    },
    async releaseCells(bookingId, cellKeys) {
      const cellKeySet = new Set(cellKeys);
      for (const [key, owner] of locks.entries()) {
        if (owner.bookingId === bookingId && cellKeySet.has(owner.cellKey)) {
          locks.delete(key);
        }
      }
    },
  };
}
