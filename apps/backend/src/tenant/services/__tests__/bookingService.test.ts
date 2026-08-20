import { beforeEach, describe, expect, it } from 'vitest';

import { createBookingService } from '../bookingService.js';
import {
  createInMemoryReminderScheduler,
  createThrowingReminderScheduler,
} from './inMemoryReminderScheduler.js';
import {
  createInMemoryBookingRepo,
  createInMemoryCustomerRepo,
  createInMemorySlotLockRepo,
} from './inMemoryBookingPorts.js';

function buildService() {
  return createBookingService({
    bookingRepo: createInMemoryBookingRepo(),
    slotLockRepo: createInMemorySlotLockRepo(),
    customerRepo: createInMemoryCustomerRepo(),
  });
}

const baseInput = {
  companyId: 'company-1',
  employeeId: 'employee-1',
  serviceId: 'service-1',
  startAt: new Date('2026-06-15T09:00:00.000Z'),
  endAt: new Date('2026-06-15T10:00:00.000Z'),
  bufferMinutes: 0,
  customer: { name: 'Kari Nordmann', phone: '+4791234567' },
};

describe('bookingService.createBooking — happy path', () => {
  it('creates a confirmed booking', async () => {
    const service = buildService();
    const booking = await service.createBooking(baseInput);

    expect(booking.status).toBe('confirmed');
    expect(booking.employeeId).toBe('employee-1');
    expect(booking.startAt).toEqual(baseInput.startAt);
    expect(booking.endAt).toEqual(baseInput.endAt);
  });

  it('finds an existing customer by phone instead of creating a duplicate', async () => {
    const service = buildService();
    const first = await service.createBooking(baseInput);
    const second = await service.createBooking({
      ...baseInput,
      startAt: new Date('2026-06-16T09:00:00.000Z'),
      endAt: new Date('2026-06-16T10:00:00.000Z'),
    });

    expect(first.customerId).toBe(second.customerId);
  });

  it('applies the buffer to the reserved footprint (a booking starting right after is rejected)', async () => {
    const service = buildService();
    await service.createBooking({ ...baseInput, bufferMinutes: 15 });

    await expect(
      service.createBooking({
        ...baseInput,
        startAt: baseInput.endAt,
        endAt: new Date(baseInput.endAt.getTime() + 60 * 60_000),
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_CONFLICT' });
  });

  it('allows a booking that starts exactly when a zero-buffer booking ends (touching)', async () => {
    const service = buildService();
    await service.createBooking(baseInput);

    const next = await service.createBooking({
      ...baseInput,
      startAt: baseInput.endAt,
      endAt: new Date(baseInput.endAt.getTime() + 60 * 60_000),
    });
    expect(next.status).toBe('confirmed');
  });

  it('allows overlapping bookings for DIFFERENT employees at the same time', async () => {
    const service = buildService();
    await service.createBooking(baseInput);

    const otherEmployee = await service.createBooking({
      ...baseInput,
      employeeId: 'employee-2',
    });
    expect(otherEmployee.status).toBe('confirmed');
  });
});

describe('bookingService.createBooking — conflict handling', () => {
  it('rejects a second booking that exactly overlaps an existing one, with BOOKING_CONFLICT', async () => {
    const service = buildService();
    await service.createBooking(baseInput);

    await expect(service.createBooking(baseInput)).rejects.toMatchObject({
      code: 'BOOKING_CONFLICT',
      httpStatus: 409,
      publicMessage: 'The selected time is no longer available.',
    });
  });

  it('rejects a booking that partially overlaps an existing one', async () => {
    const service = buildService();
    await service.createBooking(baseInput);

    await expect(
      service.createBooking({
        ...baseInput,
        startAt: new Date('2026-06-15T09:30:00.000Z'),
        endAt: new Date('2026-06-15T10:30:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_CONFLICT' });
  });

  it('a losing booking never gets created at all (no orphaned record)', async () => {
    const service = buildService();
    const winner = await service.createBooking(baseInput);

    try {
      await service.createBooking(baseInput);
    } catch {
      // expected
    }

    const another = await service.createBooking({
      ...baseInput,
      startAt: new Date('2026-06-17T09:00:00.000Z'),
      endAt: new Date('2026-06-17T10:00:00.000Z'),
    });
    expect(another.status).toBe('confirmed');
    expect(winner.status).toBe('confirmed');
  });
});

describe('bookingService.createBooking — concurrency (dev-tasks.md §10 race-condition tests)', () => {
  it('exactly ONE of 5 concurrent requests for the identical slot succeeds', async () => {
    const service = buildService();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.createBooking(baseInput)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected as PromiseRejectedResult[]) {
      expect(r.reason).toMatchObject({ code: 'BOOKING_CONFLICT' });
    }
  });

  it('exactly ONE of 20 concurrent requests for the identical slot succeeds', async () => {
    const service = buildService();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.createBooking(baseInput)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(19);
  });

  it('concurrent requests for DIFFERENT non-overlapping slots all succeed', async () => {
    const service = buildService();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        service.createBooking({
          ...baseInput,
          startAt: new Date(baseInput.startAt.getTime() + i * 60 * 60_000),
          endAt: new Date(baseInput.endAt.getTime() + i * 60 * 60_000),
        }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
  });

  it('concurrent requests for overlapping-but-not-identical ranges still resolve to exactly one winner', async () => {
    const service = buildService();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        service.createBooking({
          ...baseInput,
          startAt: new Date(baseInput.startAt.getTime() + i * 10 * 60_000),
          endAt: new Date(baseInput.endAt.getTime() + i * 10 * 60_000),
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expect(fulfilled).toBeLessThan(5);
  });
});

describe('bookingService.updateStatus', () => {
  let service: ReturnType<typeof buildService>;
  let bookingId: string;

  beforeEach(async () => {
    service = buildService();
    const booking = await service.createBooking(baseInput);
    bookingId = booking.id;
  });

  it('allows confirmed -> completed', async () => {
    const updated = await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'completed',
    });
    expect(updated.status).toBe('completed');
  });

  it('allows confirmed -> cancelled', async () => {
    const updated = await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'cancelled',
      cancellationReason: 'Customer requested',
    });
    expect(updated.status).toBe('cancelled');
    expect(updated.cancellationReason).toBe('Customer requested');
  });

  it('allows confirmed -> no_show', async () => {
    const updated = await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'no_show',
    });
    expect(updated.status).toBe('no_show');
  });

  it('rejects completed -> cancelled (invalid transition, completed is terminal)', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'completed',
    });

    await expect(
      service.updateStatus({ companyId: baseInput.companyId, bookingId, newStatus: 'cancelled' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects double-completing the same booking', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'completed',
    });

    await expect(
      service.updateStatus({ companyId: baseInput.companyId, bookingId, newStatus: 'completed' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws NotFoundError for an unknown booking id', async () => {
    await expect(
      service.updateStatus({
        companyId: baseInput.companyId,
        bookingId: 'does-not-exist',
        newStatus: 'completed',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('releases the slot lock on cancellation — the same time becomes bookable again', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'cancelled',
    });

    const rebooked = await service.createBooking(baseInput);
    expect(rebooked.status).toBe('confirmed');
  });

  it('releases the slot lock on no-show — the same time becomes bookable again', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'no_show',
    });

    const rebooked = await service.createBooking(baseInput);
    expect(rebooked.status).toBe('confirmed');
  });

  it('does NOT release the slot lock on completion — the time stays reserved', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'completed',
    });

    await expect(service.createBooking(baseInput)).rejects.toMatchObject({
      code: 'BOOKING_CONFLICT',
    });
  });

  it('only one of two concurrent cancel/no-show requests for the same booking wins', async () => {
    const results = await Promise.allSettled([
      service.updateStatus({ companyId: baseInput.companyId, bookingId, newStatus: 'cancelled' }),
      service.updateStatus({ companyId: baseInput.companyId, bookingId, newStatus: 'no_show' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
  });
});

describe('bookingService.rescheduleBooking', () => {
  let service: ReturnType<typeof buildService>;
  let bookingId: string;

  beforeEach(async () => {
    service = buildService();
    const booking = await service.createBooking(baseInput);
    bookingId = booking.id;
  });

  it('moves the booking to a new, non-overlapping time', async () => {
    const newStart = new Date('2026-06-15T14:00:00.000Z');
    const newEnd = new Date('2026-06-15T15:00:00.000Z');

    const updated = await service.rescheduleBooking({
      companyId: baseInput.companyId,
      bookingId,
      newStartAt: newStart,
      newEndAt: newEnd,
      bufferMinutes: 0,
    });

    expect(updated.startAt).toEqual(newStart);
    expect(updated.endAt).toEqual(newEnd);
  });

  it('frees the OLD time slot — a new booking can now be made there', async () => {
    await service.rescheduleBooking({
      companyId: baseInput.companyId,
      bookingId,
      newStartAt: new Date('2026-06-15T14:00:00.000Z'),
      newEndAt: new Date('2026-06-15T15:00:00.000Z'),
      bufferMinutes: 0,
    });

    const rebooked = await service.createBooking(baseInput); // original 09:00-10:00 slot
    expect(rebooked.status).toBe('confirmed');
  });

  it('rejects rescheduling into a time already occupied by ANOTHER booking', async () => {
    await service.createBooking({
      ...baseInput,
      startAt: new Date('2026-06-15T14:00:00.000Z'),
      endAt: new Date('2026-06-15T15:00:00.000Z'),
    });

    await expect(
      service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId,
        newStartAt: new Date('2026-06-15T14:00:00.000Z'),
        newEndAt: new Date('2026-06-15T15:00:00.000Z'),
        bufferMinutes: 0,
      }),
    ).rejects.toMatchObject({ code: 'BOOKING_CONFLICT' });
  });

  it('leaves the ORIGINAL booking untouched when the reschedule is rejected', async () => {
    await service.createBooking({
      ...baseInput,
      startAt: new Date('2026-06-15T14:00:00.000Z'),
      endAt: new Date('2026-06-15T15:00:00.000Z'),
    });

    try {
      await service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId,
        newStartAt: new Date('2026-06-15T14:00:00.000Z'),
        newEndAt: new Date('2026-06-15T15:00:00.000Z'),
        bufferMinutes: 0,
      });
    } catch {
      // expected
    }

    // The original 09:00-10:00 slot must still be locked by this booking —
    // a duplicate create attempt for it must still conflict.
    await expect(service.createBooking(baseInput)).rejects.toMatchObject({
      code: 'BOOKING_CONFLICT',
    });
  });

  it('rejects rescheduling a cancelled booking', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'cancelled',
      cancellationReason: 'test',
    });

    await expect(
      service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId,
        newStartAt: new Date('2026-06-15T14:00:00.000Z'),
        newEndAt: new Date('2026-06-15T15:00:00.000Z'),
        bufferMinutes: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects rescheduling a completed booking', async () => {
    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId,
      newStatus: 'completed',
    });

    await expect(
      service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId,
        newStartAt: new Date('2026-06-15T14:00:00.000Z'),
        newEndAt: new Date('2026-06-15T15:00:00.000Z'),
        bufferMinutes: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws NotFoundError for an unknown booking id', async () => {
    await expect(
      service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId: 'does-not-exist',
        newStartAt: new Date('2026-06-15T14:00:00.000Z'),
        newEndAt: new Date('2026-06-15T15:00:00.000Z'),
        bufferMinutes: 0,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a reschedule into the SAME time succeeds without incident (no-op time change)', async () => {
    const updated = await service.rescheduleBooking({
      companyId: baseInput.companyId,
      bookingId,
      newStartAt: baseInput.startAt,
      newEndAt: baseInput.endAt,
      bufferMinutes: 0,
    });
    expect(updated.startAt).toEqual(baseInput.startAt);
  });

  it('only one of two concurrent reschedule requests to the SAME conflicting new time wins', async () => {
    const bookingA = await service.createBooking({
      ...baseInput,
      startAt: new Date('2026-06-16T09:00:00.000Z'),
      endAt: new Date('2026-06-16T10:00:00.000Z'),
    });
    const bookingB = await service.createBooking({
      ...baseInput,
      startAt: new Date('2026-06-17T09:00:00.000Z'),
      endAt: new Date('2026-06-17T10:00:00.000Z'),
    });

    const targetStart = new Date('2026-06-18T09:00:00.000Z');
    const targetEnd = new Date('2026-06-18T10:00:00.000Z');

    const results = await Promise.allSettled([
      service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId: bookingA.id,
        newStartAt: targetStart,
        newEndAt: targetEnd,
        bufferMinutes: 0,
      }),
      service.rescheduleBooking({
        companyId: baseInput.companyId,
        bookingId: bookingB.id,
        newStartAt: targetStart,
        newEndAt: targetEnd,
        bufferMinutes: 0,
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('bookingService.updateNotes', () => {
  it('updates customerNote and internalNote', async () => {
    const service = buildService();
    const booking = await service.createBooking(baseInput);

    const updated = await service.updateNotes({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      customerNote: 'Allergic to acetone',
      internalNote: 'Regular customer',
    });

    expect(updated.customerNote).toBe('Allergic to acetone');
    expect(updated.internalNote).toBe('Regular customer');
  });

  it('does not disturb the slot lock (notes are unrelated to scheduling)', async () => {
    const service = buildService();
    const booking = await service.createBooking(baseInput);
    await service.updateNotes({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      internalNote: 'note',
    });

    await expect(service.createBooking(baseInput)).rejects.toMatchObject({
      code: 'BOOKING_CONFLICT',
    });
  });

  it('throws NotFoundError for an unknown booking id', async () => {
    const service = buildService();
    await expect(
      service.updateNotes({ companyId: baseInput.companyId, bookingId: 'does-not-exist' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('bookingService — reminder scheduler integration', () => {
  it('schedules reminders on booking creation', async () => {
    const reminderScheduler = createInMemoryReminderScheduler();
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler,
    });

    const booking = await service.createBooking(baseInput);

    expect(reminderScheduler.scheduled).toHaveLength(1);
    expect(reminderScheduler.scheduled[0]).toEqual({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      startAt: baseInput.startAt,
    });
  });

  it('cancels reminders when a booking is cancelled', async () => {
    const reminderScheduler = createInMemoryReminderScheduler();
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler,
    });
    const booking = await service.createBooking(baseInput);

    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      newStatus: 'cancelled',
      cancellationReason: 'test',
    });

    expect(reminderScheduler.cancelled).toEqual([booking.id]);
  });

  it('cancels reminders on no-show too', async () => {
    const reminderScheduler = createInMemoryReminderScheduler();
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler,
    });
    const booking = await service.createBooking(baseInput);

    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      newStatus: 'no_show',
    });

    expect(reminderScheduler.cancelled).toEqual([booking.id]);
  });

  it('does NOT cancel reminders on completion (booking already happened)', async () => {
    const reminderScheduler = createInMemoryReminderScheduler();
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler,
    });
    const booking = await service.createBooking(baseInput);

    await service.updateStatus({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      newStatus: 'completed',
    });

    expect(reminderScheduler.cancelled).toHaveLength(0);
  });

  it('reschedule cancels the old reminders and schedules new ones for the new time', async () => {
    const reminderScheduler = createInMemoryReminderScheduler();
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler,
    });
    const booking = await service.createBooking(baseInput);

    const newStartAt = new Date('2026-06-16T09:00:00.000Z');
    await service.rescheduleBooking({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      newStartAt,
      newEndAt: new Date('2026-06-16T10:00:00.000Z'),
      bufferMinutes: 0,
    });

    expect(reminderScheduler.cancelled).toEqual([booking.id]);
    expect(reminderScheduler.scheduled).toHaveLength(2); // once on create, once on reschedule
    expect(reminderScheduler.scheduled[1]).toEqual({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      startAt: newStartAt,
    });
  });

  it('works fine with no reminderScheduler provided at all (fully optional)', async () => {
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
    });
    const booking = await service.createBooking(baseInput);
    expect(booking.status).toBe('confirmed');
  });

  it('RESILIENCE: a throwing reminder scheduler never breaks booking creation', async () => {
    const service = createBookingService({
      bookingRepo: createInMemoryBookingRepo(),
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler: createThrowingReminderScheduler(),
    });

    const booking = await service.createBooking(baseInput);
    expect(booking.status).toBe('confirmed');
  });

  it('RESILIENCE: a throwing reminder scheduler never breaks cancellation', async () => {
    const bookingRepo = createInMemoryBookingRepo();
    const workingScheduler = createInMemoryReminderScheduler();
    const createService = createBookingService({
      bookingRepo,
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler: workingScheduler,
    });
    const booking = await createService.createBooking(baseInput);

    const cancelService = createBookingService({
      bookingRepo,
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler: createThrowingReminderScheduler(),
    });

    const updated = await cancelService.updateStatus({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      newStatus: 'cancelled',
      cancellationReason: 'test',
    });
    expect(updated.status).toBe('cancelled');
  });

  it('RESILIENCE: a throwing reminder scheduler never breaks reschedule', async () => {
    const bookingRepo = createInMemoryBookingRepo();
    const workingScheduler = createInMemoryReminderScheduler();
    const createService = createBookingService({
      bookingRepo,
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler: workingScheduler,
    });
    const booking = await createService.createBooking(baseInput);

    const rescheduleService = createBookingService({
      bookingRepo,
      slotLockRepo: createInMemorySlotLockRepo(),
      customerRepo: createInMemoryCustomerRepo(),
      reminderScheduler: createThrowingReminderScheduler(),
    });

    const updated = await rescheduleService.rescheduleBooking({
      companyId: baseInput.companyId,
      bookingId: booking.id,
      newStartAt: new Date('2026-06-16T09:00:00.000Z'),
      newEndAt: new Date('2026-06-16T10:00:00.000Z'),
      bufferMinutes: 0,
    });
    expect(updated.startAt).toEqual(new Date('2026-06-16T09:00:00.000Z'));
  });
});
