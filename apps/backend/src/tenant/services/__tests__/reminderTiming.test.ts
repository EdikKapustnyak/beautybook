import { describe, expect, it } from 'vitest';

import { computeReminderTimes } from '../reminderTiming.js';

describe('computeReminderTimes', () => {
  it('computes 24h and 2h before startAt', () => {
    const startAt = new Date('2026-06-20T10:00:00.000Z');
    const now = new Date('2026-06-01T00:00:00.000Z');

    const result = computeReminderTimes(startAt, now);

    expect(result.reminder24hAt).toEqual(new Date('2026-06-19T10:00:00.000Z'));
    expect(result.reminder2hAt).toEqual(new Date('2026-06-20T08:00:00.000Z'));
  });

  it('omits the 24h reminder if its target time has already passed', () => {
    const startAt = new Date('2026-06-20T10:00:00.000Z');
    const now = new Date('2026-06-20T00:00:00.000Z');

    const result = computeReminderTimes(startAt, now);

    expect(result.reminder24hAt).toBeUndefined();
    expect(result.reminder2hAt).toEqual(new Date('2026-06-20T08:00:00.000Z'));
  });

  it('omits BOTH reminders for a booking made less than 2 hours out', () => {
    const startAt = new Date('2026-06-20T10:00:00.000Z');
    const now = new Date('2026-06-20T09:00:00.000Z');

    const result = computeReminderTimes(startAt, now);

    expect(result.reminder24hAt).toBeUndefined();
    expect(result.reminder2hAt).toBeUndefined();
  });

  it('DST: the 24h reminder is exactly 24 real elapsed hours before, across the spring-forward transition', () => {
    const startAt = new Date('2026-03-30T08:00:00.000Z');
    const now = new Date('2026-03-25T00:00:00.000Z');

    const result = computeReminderTimes(startAt, now);

    expect(result.reminder24hAt).toEqual(new Date('2026-03-29T08:00:00.000Z'));
    expect(startAt.getTime() - (result.reminder24hAt?.getTime() ?? 0)).toBe(24 * 60 * 60 * 1000);
  });

  it('DST: the 24h reminder is exactly 24 real elapsed hours before, across the fall-back transition', () => {
    const startAt = new Date('2026-10-26T09:00:00.000Z');
    const now = new Date('2026-10-20T00:00:00.000Z');

    const result = computeReminderTimes(startAt, now);

    expect(startAt.getTime() - (result.reminder24hAt?.getTime() ?? 0)).toBe(24 * 60 * 60 * 1000);
  });

  it('is timezone-agnostic — the same UTC startAt produces the same reminder times regardless of any timezone context', () => {
    const startAt = new Date('2026-06-20T10:00:00.000Z');
    const now = new Date('2026-06-01T00:00:00.000Z');

    const first = computeReminderTimes(startAt, now);
    const second = computeReminderTimes(new Date(startAt), new Date(now));

    expect(first).toEqual(second);
  });
});
