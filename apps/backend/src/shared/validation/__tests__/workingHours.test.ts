import { describe, expect, it } from 'vitest';

import {
  getWeeklyScheduleError,
  isValidTimeFormat,
  isValidWeeklySchedule,
  type WeeklySchedule,
} from '../workingHours.js';

describe('isValidTimeFormat', () => {
  it('accepts valid 24h HH:mm times', () => {
    expect(isValidTimeFormat('09:00')).toBe(true);
    expect(isValidTimeFormat('23:59')).toBe(true);
    expect(isValidTimeFormat('00:00')).toBe(true);
  });

  it('rejects 12h format, malformed strings, and out-of-range values', () => {
    expect(isValidTimeFormat('9:00 AM')).toBe(false);
    expect(isValidTimeFormat('24:00')).toBe(false);
    expect(isValidTimeFormat('12:60')).toBe(false);
    expect(isValidTimeFormat('not-a-time')).toBe(false);
    expect(isValidTimeFormat('')).toBe(false);
  });
});

describe('getWeeklyScheduleError / isValidWeeklySchedule', () => {
  it('accepts an empty schedule (no days set — e.g. brand new employee)', () => {
    expect(getWeeklyScheduleError({})).toBeNull();
    expect(isValidWeeklySchedule({})).toBe(true);
  });

  it('accepts a simple single-period weekday schedule', () => {
    const schedule: WeeklySchedule = {
      monday: [{ start: '09:00', end: '18:00' }],
      tuesday: [{ start: '09:00', end: '18:00' }],
      wednesday: [],
      thursday: [{ start: '10:00', end: '19:00' }],
      friday: [{ start: '09:00', end: '17:00' }],
    };
    expect(getWeeklyScheduleError(schedule)).toBeNull();
  });

  it('accepts a split-shift day (two non-overlapping periods)', () => {
    const schedule: WeeklySchedule = {
      monday: [
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '18:00' },
      ],
    };
    expect(getWeeklyScheduleError(schedule)).toBeNull();
  });

  it('accepts a period with a valid lunch break inside it', () => {
    const schedule: WeeklySchedule = {
      monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }],
    };
    expect(getWeeklyScheduleError(schedule)).toBeNull();
  });

  it('rejects a malformed time string', () => {
    const schedule: WeeklySchedule = { monday: [{ start: '9am', end: '18:00' }] };
    expect(getWeeklyScheduleError(schedule)).toMatch(/HH:mm/);
  });

  it('rejects a period that ends before it starts (midnight-crossing not supported)', () => {
    const schedule: WeeklySchedule = { monday: [{ start: '22:00', end: '02:00' }] };
    expect(getWeeklyScheduleError(schedule)).toMatch(/end after it starts/i);
  });

  it('rejects a zero-length period', () => {
    const schedule: WeeklySchedule = { monday: [{ start: '09:00', end: '09:00' }] };
    expect(getWeeklyScheduleError(schedule)).toMatch(/end after it starts/i);
  });

  it('rejects two overlapping working periods on the same day', () => {
    const schedule: WeeklySchedule = {
      monday: [
        { start: '09:00', end: '13:00' },
        { start: '12:00', end: '18:00' },
      ],
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/overlapping working periods/i);
  });

  it('detects overlap regardless of input order', () => {
    const schedule: WeeklySchedule = {
      monday: [
        { start: '12:00', end: '18:00' },
        { start: '09:00', end: '13:00' },
      ],
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/overlapping working periods/i);
  });

  it('rejects a break that falls outside its working period', () => {
    const schedule: WeeklySchedule = {
      monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '08:00', end: '08:30' }] }],
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/within the working period/i);
  });

  it('rejects a break extending past the end of its working period', () => {
    const schedule: WeeklySchedule = {
      monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '17:30', end: '18:30' }] }],
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/within the working period/i);
  });

  it('rejects two overlapping breaks within the same period', () => {
    const schedule: WeeklySchedule = {
      monday: [
        {
          start: '09:00',
          end: '18:00',
          breaks: [
            { start: '12:00', end: '13:00' },
            { start: '12:30', end: '14:00' },
          ],
        },
      ],
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/overlapping breaks/i);
  });

  it('rejects a break that ends before it starts', () => {
    const schedule: WeeklySchedule = {
      monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '12:00' }] }],
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/end after it starts/i);
  });

  it('validates every day, not just the first one with data', () => {
    const schedule: WeeklySchedule = {
      monday: [{ start: '09:00', end: '18:00' }],
      friday: [{ start: '09:00', end: '09:00' }], // invalid
    };
    expect(getWeeklyScheduleError(schedule)).toMatch(/friday/i);
  });
});
