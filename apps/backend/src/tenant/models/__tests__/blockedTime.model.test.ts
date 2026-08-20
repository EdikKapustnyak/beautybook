import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { BlockedTimeModel } from '../blockedTime.model.js';

function buildValidBlockedTime(overrides: Record<string, unknown> = {}) {
  return new BlockedTimeModel({
    companyId: new Types.ObjectId(),
    startAt: new Date('2026-12-25T00:00:00.000Z'),
    endAt: new Date('2026-12-26T00:00:00.000Z'),
    ...overrides,
  });
}

describe('BlockedTimeModel validation', () => {
  it('accepts a well-formed company-wide blocked interval (no employeeId)', () => {
    const blockedTime = buildValidBlockedTime();
    expect(blockedTime.validateSync()).toBeUndefined();
  });

  it('accepts a well-formed employee-specific blocked interval', () => {
    const blockedTime = buildValidBlockedTime({ employeeId: new Types.ObjectId() });
    expect(blockedTime.validateSync()).toBeUndefined();
  });

  it('requires companyId', () => {
    const blockedTime = buildValidBlockedTime({ companyId: undefined });
    expect(blockedTime.validateSync()?.errors.companyId).toBeDefined();
  });

  it('requires startAt', () => {
    const blockedTime = buildValidBlockedTime({ startAt: undefined });
    expect(blockedTime.validateSync()?.errors.startAt).toBeDefined();
  });

  it('requires endAt', () => {
    const blockedTime = buildValidBlockedTime({ endAt: undefined });
    expect(blockedTime.validateSync()?.errors.endAt).toBeDefined();
  });

  it('rejects endAt equal to startAt', () => {
    const sameInstant = new Date('2026-12-25T10:00:00.000Z');
    const blockedTime = buildValidBlockedTime({ startAt: sameInstant, endAt: sameInstant });
    expect(blockedTime.validateSync()?.errors.endAt).toBeDefined();
  });

  it('rejects endAt before startAt', () => {
    const blockedTime = buildValidBlockedTime({
      startAt: new Date('2026-12-26T00:00:00.000Z'),
      endAt: new Date('2026-12-25T00:00:00.000Z'),
    });
    expect(blockedTime.validateSync()?.errors.endAt).toBeDefined();
  });

  it('accepts an optional reason', () => {
    const blockedTime = buildValidBlockedTime({ reason: 'Public holiday' });
    expect(blockedTime.validateSync()).toBeUndefined();
  });
});
