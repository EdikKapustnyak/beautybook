import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { SlotLockModel } from '../slotLock.model.js';

function buildValidSlotLock(overrides: Record<string, unknown> = {}) {
  return new SlotLockModel({
    employeeId: new Types.ObjectId(),
    cellKey: '12345',
    bookingId: new Types.ObjectId(),
    ...overrides,
  });
}

describe('SlotLockModel validation', () => {
  it('accepts a well-formed slot lock', () => {
    const lock = buildValidSlotLock();
    expect(lock.validateSync()).toBeUndefined();
  });

  it('requires employeeId', () => {
    const lock = buildValidSlotLock({ employeeId: undefined });
    expect(lock.validateSync()?.errors.employeeId).toBeDefined();
  });

  it('requires cellKey', () => {
    const lock = buildValidSlotLock({ cellKey: undefined });
    expect(lock.validateSync()?.errors.cellKey).toBeDefined();
  });

  it('requires bookingId', () => {
    const lock = buildValidSlotLock({ bookingId: undefined });
    expect(lock.validateSync()?.errors.bookingId).toBeDefined();
  });
});
