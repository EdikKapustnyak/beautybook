import { describe, expect, it } from 'vitest';

import {
  createBookingSchema,
  rescheduleBookingSchema,
  updateBookingNotesSchema,
  updateBookingStatusSchema,
} from '../bookingSchemas.js';

const VALID_ID = '507f1f77bcf86cd799439011';
const future = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);

describe('createBookingSchema', () => {
  const validBooking = {
    employeeId: VALID_ID,
    serviceId: VALID_ID,
    startAt: future(24).toISOString(),
    customer: { name: 'Kari Nordmann', phone: '+4791234567' },
  };

  it('accepts a valid booking request', () => {
    expect(createBookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it('rejects a booking that starts in the past', () => {
    const result = createBookingSchema.safeParse({
      ...validBooking,
      startAt: future(-1).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid employeeId', () => {
    const result = createBookingSchema.safeParse({ ...validBooking, employeeId: 'not-an-id' });
    expect(result.success).toBe(false);
  });

  it('rejects HTML in customerNote', () => {
    const result = createBookingSchema.safeParse({
      ...validBooking,
      customerNote: '<script>alert(1)</script>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mass-assignment attempts (companyId, status)', () => {
    const result = createBookingSchema.safeParse({
      ...validBooking,
      companyId: 'someone-elses-company',
      status: 'confirmed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a customer with a missing phone', () => {
    const result = createBookingSchema.safeParse({
      ...validBooking,
      customer: { name: 'Kari' },
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBookingStatusSchema', () => {
  it('accepts a valid status transition', () => {
    expect(updateBookingStatusSchema.safeParse({ status: 'completed' }).success).toBe(true);
  });

  it('requires a cancellationReason when cancelling', () => {
    const result = updateBookingStatusSchema.safeParse({ status: 'cancelled' });
    expect(result.success).toBe(false);
  });

  it('accepts cancellation with a reason', () => {
    const result = updateBookingStatusSchema.safeParse({
      status: 'cancelled',
      cancellationReason: 'Customer requested',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = updateBookingStatusSchema.safeParse({ status: 'made_up' });
    expect(result.success).toBe(false);
  });
});

describe('rescheduleBookingSchema', () => {
  it('accepts a valid future startAt', () => {
    const result = rescheduleBookingSchema.safeParse({ startAt: future(24).toISOString() });
    expect(result.success).toBe(true);
  });

  it('rejects a startAt in the past', () => {
    const result = rescheduleBookingSchema.safeParse({ startAt: future(-24).toISOString() });
    expect(result.success).toBe(false);
  });

  it('rejects mass-assignment attempts (employeeId, status)', () => {
    const result = rescheduleBookingSchema.safeParse({
      startAt: future(24).toISOString(),
      employeeId: 'someone-elses-employee',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBookingNotesSchema', () => {
  it('accepts a customerNote-only update', () => {
    expect(
      updateBookingNotesSchema.safeParse({ customerNote: 'Allergic to acetone' }).success,
    ).toBe(true);
  });

  it('accepts an internalNote-only update', () => {
    expect(updateBookingNotesSchema.safeParse({ internalNote: 'Regular customer' }).success).toBe(
      true,
    );
  });

  it('rejects an empty update (neither note provided)', () => {
    expect(updateBookingNotesSchema.safeParse({}).success).toBe(false);
  });

  it('rejects HTML in either note', () => {
    expect(
      updateBookingNotesSchema.safeParse({ customerNote: '<img src=x onerror=alert(1)>' }).success,
    ).toBe(false);
    expect(updateBookingNotesSchema.safeParse({ internalNote: '<script>x</script>' }).success).toBe(
      false,
    );
  });
});
