import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { BookingModel } from '../booking.model.js';

function buildValidBooking(overrides: Record<string, unknown> = {}) {
  const startAt = new Date('2026-06-15T09:00:00.000Z');
  const endAt = new Date('2026-06-15T10:00:00.000Z');
  return new BookingModel({
    companyId: new Types.ObjectId(),
    employeeId: new Types.ObjectId(),
    customerId: new Types.ObjectId(),
    serviceId: new Types.ObjectId(),
    startAt,
    endAt,
    footprintEndAt: endAt,
    ...overrides,
  });
}

describe('BookingModel validation', () => {
  it('accepts a well-formed booking', () => {
    const booking = buildValidBooking();
    expect(booking.validateSync()).toBeUndefined();
  });

  it('requires companyId, employeeId, customerId, serviceId', () => {
    for (const field of ['companyId', 'employeeId', 'customerId', 'serviceId']) {
      const booking = buildValidBooking({ [field]: undefined });
      expect(booking.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it('rejects endAt equal to or before startAt', () => {
    const same = new Date('2026-06-15T09:00:00.000Z');
    const booking = buildValidBooking({ startAt: same, endAt: same, footprintEndAt: same });
    expect(booking.validateSync()?.errors.endAt).toBeDefined();
  });

  it('rejects footprintEndAt before endAt', () => {
    const booking = buildValidBooking({
      footprintEndAt: new Date('2026-06-15T09:30:00.000Z'), // before endAt (10:00)
    });
    expect(booking.validateSync()?.errors.footprintEndAt).toBeDefined();
  });

  it('accepts footprintEndAt equal to endAt (zero buffer)', () => {
    const booking = buildValidBooking();
    expect(booking.validateSync()).toBeUndefined();
  });

  it('accepts footprintEndAt after endAt (buffer reserved)', () => {
    const booking = buildValidBooking({
      footprintEndAt: new Date('2026-06-15T10:15:00.000Z'),
    });
    expect(booking.validateSync()).toBeUndefined();
  });

  it('defaults status to "pending"', () => {
    const booking = buildValidBooking();
    expect(booking.status).toBe('pending');
  });

  it('rejects an invalid status value', () => {
    const booking = buildValidBooking({ status: 'made_up_status' });
    expect(booking.validateSync()?.errors.status).toBeDefined();
  });

  it('accepts optional notes and cancellation reason', () => {
    const booking = buildValidBooking({
      customerNote: 'Allergic to acetone',
      internalNote: 'Regular, prefers window seat',
      cancellationReason: 'Customer requested',
    });
    expect(booking.validateSync()).toBeUndefined();
  });
});
