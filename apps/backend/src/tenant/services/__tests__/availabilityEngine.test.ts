import { describe, expect, it } from 'vitest';

import {
  calculateAvailableSlots,
  getDayBoundsUtc,
  isSlotAvailable,
  type CalculateAvailableSlotsInput,
  type TimeInterval,
} from '../availabilityEngine.js';

const OSLO = 'Europe/Oslo';

function baseInput(
  overrides: Partial<CalculateAvailableSlotsInput> = {},
): CalculateAvailableSlotsInput {
  return {
    date: '2026-06-15', // a Monday
    timezone: OSLO,
    workingHours: { monday: [{ start: '09:00', end: '18:00' }] },
    blockedIntervals: [],
    bookedIntervals: [],
    serviceDurationMinutes: 60,
    serviceBufferMinutes: 0,
    now: new Date('2026-01-01T00:00:00Z'), // fixed "now" well before the test date
    ...overrides,
  };
}

function iso(date: Date): string {
  return date.toISOString();
}

function firstSlot<T>(slots: T[]): T {
  const slot = slots[0];
  if (!slot) {
    throw new Error('Expected at least one slot but got none.');
  }
  return slot;
}

describe('calculateAvailableSlots — basic generation', () => {
  it('returns no slots on a day off (no working periods)', () => {
    const slots = calculateAvailableSlots(baseInput({ workingHours: { monday: [] } }));
    expect(slots).toEqual([]);
  });

  it('returns no slots for a weekday with no schedule entry at all', () => {
    const slots = calculateAvailableSlots(baseInput({ workingHours: {} }));
    expect(slots).toEqual([]);
  });

  it('generates a normal free slot at the start of the working period', () => {
    const slots = calculateAvailableSlots(baseInput());
    expect(slots.length).toBeGreaterThan(0);
    // 09:00 Europe/Oslo in June (CEST, UTC+2) = 07:00 UTC.
    expect(iso(firstSlot(slots).start)).toBe('2026-06-15T07:00:00.000Z');
    expect(iso(firstSlot(slots).end)).toBe('2026-06-15T08:00:00.000Z');
  });

  it('allows a slot that ends EXACTLY at the working period close (boundary)', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
        serviceDurationMinutes: 60,
      }),
    );
    expect(slots).toHaveLength(1);
    expect(iso(firstSlot(slots).end)).toBe('2026-06-15T08:00:00.000Z'); // 10:00 Oslo = 08:00 UTC
  });

  it('generates no slots when the service is longer than the whole working period', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: { monday: [{ start: '09:00', end: '09:30' }] },
        serviceDurationMinutes: 60,
      }),
    );
    expect(slots).toEqual([]);
  });

  it('steps candidate slots by the configured granularity', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
        serviceDurationMinutes: 30,
        slotGranularityMinutes: 30,
      }),
    );
    expect(slots).toHaveLength(2);
  });
});

describe('calculateAvailableSlots — breaks', () => {
  it('excludes slots that would overlap a break', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: {
          monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }],
        },
      }),
    );
    const overlapsBreak = slots.some((slot) => {
      const breakStart = new Date('2026-06-15T10:00:00.000Z'); // 12:00 Oslo
      const breakEnd = new Date('2026-06-15T11:00:00.000Z'); // 13:00 Oslo
      return slot.start < breakEnd && slot.end > breakStart;
    });
    expect(overlapsBreak).toBe(false);
  });

  it('allows a slot that ends EXACTLY when the break starts (boundary)', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: {
          monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }],
        },
        serviceDurationMinutes: 60,
      }),
    );
    const touchesBreakStart = slots.some(
      (slot) => iso(slot.end) === '2026-06-15T10:00:00.000Z', // 12:00 Oslo
    );
    expect(touchesBreakStart).toBe(true);
  });

  it('allows a slot that starts EXACTLY when the break ends (boundary)', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: {
          monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }],
        },
        serviceDurationMinutes: 60,
      }),
    );
    const touchesBreakEnd = slots.some(
      (slot) => iso(slot.start) === '2026-06-15T11:00:00.000Z', // 13:00 Oslo
    );
    expect(touchesBreakEnd).toBe(true);
  });
});

describe('calculateAvailableSlots — blocked intervals', () => {
  it('excludes slots inside a blocked interval', () => {
    const blocked: TimeInterval = {
      start: new Date('2026-06-15T09:00:00.000Z'), // 11:00 Oslo
      end: new Date('2026-06-15T11:00:00.000Z'), // 13:00 Oslo
    };
    const slots = calculateAvailableSlots(baseInput({ blockedIntervals: [blocked] }));
    const overlapsBlocked = slots.some(
      (slot) => slot.start < blocked.end && slot.end > blocked.start,
    );
    expect(overlapsBlocked).toBe(false);
  });

  it('returns no slots for a fully blocked day', () => {
    const wholeDayBlocked: TimeInterval = {
      start: new Date('2026-06-15T00:00:00.000Z'),
      end: new Date('2026-06-16T00:00:00.000Z'),
    };
    const slots = calculateAvailableSlots(baseInput({ blockedIntervals: [wholeDayBlocked] }));
    expect(slots).toEqual([]);
  });
});

describe('calculateAvailableSlots — existing bookings', () => {
  it('excludes a slot that would overlap an existing booking', () => {
    const booked: TimeInterval = {
      start: new Date('2026-06-15T08:00:00.000Z'), // 10:00 Oslo
      end: new Date('2026-06-15T09:00:00.000Z'), // 11:00 Oslo
    };
    const slots = calculateAvailableSlots(baseInput({ bookedIntervals: [booked] }));
    const overlaps = slots.some((slot) => slot.start < booked.end && slot.end > booked.start);
    expect(overlaps).toBe(false);
  });

  it('allows a slot that starts EXACTLY when a previous booking ends (touching, not overlapping)', () => {
    const booked: TimeInterval = {
      start: new Date('2026-06-15T07:00:00.000Z'), // 09:00 Oslo
      end: new Date('2026-06-15T08:00:00.000Z'), // 10:00 Oslo
    };
    const slots = calculateAvailableSlots(baseInput({ bookedIntervals: [booked] }));
    const touchesEnd = slots.some((slot) => slot.start.getTime() === booked.end.getTime());
    expect(touchesEnd).toBe(true);
  });

  it('does NOT allow a slot that starts even 1 minute before a booking ends (overlap, not touching)', () => {
    const booked: TimeInterval = {
      start: new Date('2026-06-15T07:00:00.000Z'),
      end: new Date('2026-06-15T08:00:00.000Z'),
    };
    const slots = calculateAvailableSlots(baseInput({ bookedIntervals: [booked] }));
    const almostOverlaps = slots.some(
      (slot) => slot.start.getTime() === booked.end.getTime() - 60_000,
    );
    expect(almostOverlaps).toBe(false);
  });
});

describe('calculateAvailableSlots — buffer', () => {
  it('reserves buffer time after the service, pushing the next slot start later', () => {
    const withoutBuffer = calculateAvailableSlots(
      baseInput({
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
        serviceDurationMinutes: 30,
        serviceBufferMinutes: 0,
        slotGranularityMinutes: 15,
      }),
    );
    const withBuffer = calculateAvailableSlots(
      baseInput({
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
        serviceDurationMinutes: 30,
        serviceBufferMinutes: 15,
        slotGranularityMinutes: 15,
      }),
    );
    expect(withoutBuffer.length).toBeGreaterThan(withBuffer.length);
  });

  it('the returned slot end time is the service duration only — buffer is not customer-visible', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: { monday: [{ start: '09:00', end: '18:00' }] },
        serviceDurationMinutes: 30,
        serviceBufferMinutes: 15,
      }),
    );
    const first = firstSlot(slots);
    expect(first.end.getTime() - first.start.getTime()).toBe(30 * 60_000);
  });
});

describe('calculateAvailableSlots — past-slot exclusion', () => {
  it('excludes slots that start before `now`', () => {
    const cutoff = new Date('2026-06-15T07:30:00.000Z'); // 09:30 Oslo
    const slots = calculateAvailableSlots(baseInput({ now: cutoff }));
    const anyInPast = slots.some((slot) => slot.start.getTime() < cutoff.getTime());
    expect(anyInPast).toBe(false);
  });
});

describe('calculateAvailableSlots — timezone conversion', () => {
  it('the same local schedule produces different UTC instants in different timezones', () => {
    const osloSlots = calculateAvailableSlots(
      baseInput({
        timezone: 'Europe/Oslo',
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
      }),
    );
    const nySlots = calculateAvailableSlots(
      baseInput({
        timezone: 'America/New_York',
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
      }),
    );
    expect(iso(firstSlot(osloSlots).start)).not.toBe(iso(firstSlot(nySlots).start));
  });
});

describe('calculateAvailableSlots — DST', () => {
  // Europe/Oslo DST 2026: starts Sun 29 Mar (spring forward, +1h -> +2h),
  // ends Sun 25 Oct (fall back, +2h -> +1h).
  it('produces the correct UTC offset just before and just after the spring-forward transition', () => {
    const beforeDst = calculateAvailableSlots(
      baseInput({
        date: '2026-03-23', // Monday before the transition (CET, UTC+1)
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
      }),
    );
    const afterDst = calculateAvailableSlots(
      baseInput({
        date: '2026-03-30', // Monday after the transition (CEST, UTC+2)
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
      }),
    );
    expect(iso(firstSlot(beforeDst).start)).toBe('2026-03-23T08:00:00.000Z'); // 09:00 CET = 08:00 UTC
    expect(iso(firstSlot(afterDst).start)).toBe('2026-03-30T07:00:00.000Z'); // 09:00 CEST = 07:00 UTC
  });

  it('produces the correct UTC offset just before and just after the fall-back transition', () => {
    const beforeDst = calculateAvailableSlots(
      baseInput({
        date: '2026-10-19', // Monday before fall-back (CEST, UTC+2)
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
      }),
    );
    const afterDst = calculateAvailableSlots(
      baseInput({
        date: '2026-10-26', // Monday after fall-back (CET, UTC+1)
        workingHours: { monday: [{ start: '09:00', end: '10:00' }] },
      }),
    );
    expect(iso(firstSlot(beforeDst).start)).toBe('2026-10-19T07:00:00.000Z');
    expect(iso(firstSlot(afterDst).start)).toBe('2026-10-26T08:00:00.000Z');
  });

  it('does not throw when generating slots for the DST transition date itself', () => {
    expect(() =>
      calculateAvailableSlots(
        baseInput({
          date: '2026-03-29', // the transition day itself
          workingHours: { monday: [] }, // avoid asserting on the exact gap; just confirm no crash
        }),
      ),
    ).not.toThrow();
  });
});

describe('calculateAvailableSlots — split shifts', () => {
  it('generates slots in both periods of a split-shift day, none inside the gap', () => {
    const slots = calculateAvailableSlots(
      baseInput({
        workingHours: {
          monday: [
            { start: '09:00', end: '12:00' },
            { start: '14:00', end: '18:00' },
          ],
        },
      }),
    );
    const gapStart = new Date('2026-06-15T10:00:00.000Z'); // 12:00 Oslo
    const gapEnd = new Date('2026-06-15T12:00:00.000Z'); // 14:00 Oslo
    const anyInGap = slots.some((slot) => slot.start < gapEnd && slot.end > gapStart);
    expect(anyInGap).toBe(false);
    expect(slots.some((slot) => slot.start < gapStart)).toBe(true);
    expect(slots.some((slot) => slot.start >= gapEnd)).toBe(true);
  });
});

describe('getDayBoundsUtc', () => {
  it('returns midnight-to-midnight in the given timezone, converted to UTC', () => {
    const bounds = getDayBoundsUtc('2026-06-15', OSLO);
    // June = CEST = UTC+2, so 00:00 Oslo = 22:00 UTC the previous day.
    expect(iso(bounds.start)).toBe('2026-06-14T22:00:00.000Z');
    expect(iso(bounds.end)).toBe('2026-06-15T22:00:00.000Z');
  });

  it('spans exactly 24 hours outside DST transition days', () => {
    const bounds = getDayBoundsUtc('2026-06-15', OSLO);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('spans 23 hours on the spring-forward DST transition day', () => {
    const bounds = getDayBoundsUtc('2026-03-29', OSLO);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('throws for an invalid timezone', () => {
    expect(() => getDayBoundsUtc('2026-06-15', 'Not/A_Timezone')).toThrow();
  });
});

describe('isSlotAvailable — booking-creation recheck', () => {
  const baseSlotInput = {
    date: '2026-06-15',
    timezone: OSLO,
    workingHours: { monday: [{ start: '09:00', end: '18:00' }] },
    blockedIntervals: [] as TimeInterval[],
    bookedIntervals: [] as TimeInterval[],
    serviceBufferMinutes: 0,
  };

  it('returns true for a requested interval fully within working hours, unobstructed', () => {
    const available = isSlotAvailable({
      ...baseSlotInput,
      requestedStart: new Date('2026-06-15T07:00:00.000Z'), // 09:00 Oslo
      requestedEnd: new Date('2026-06-15T08:00:00.000Z'), // 10:00 Oslo
    });
    expect(available).toBe(true);
  });

  it('returns false for a requested interval outside working hours', () => {
    const available = isSlotAvailable({
      ...baseSlotInput,
      requestedStart: new Date('2026-06-15T05:00:00.000Z'), // 07:00 Oslo — before opening
      requestedEnd: new Date('2026-06-15T06:00:00.000Z'),
    });
    expect(available).toBe(false);
  });

  it('returns false when the requested interval overlaps an existing booking', () => {
    const available = isSlotAvailable({
      ...baseSlotInput,
      bookedIntervals: [
        { start: new Date('2026-06-15T07:00:00.000Z'), end: new Date('2026-06-15T08:00:00.000Z') },
      ],
      requestedStart: new Date('2026-06-15T07:30:00.000Z'),
      requestedEnd: new Date('2026-06-15T08:30:00.000Z'),
    });
    expect(available).toBe(false);
  });

  it('returns true when the requested interval starts exactly when a booking ends (touching)', () => {
    const available = isSlotAvailable({
      ...baseSlotInput,
      bookedIntervals: [
        { start: new Date('2026-06-15T07:00:00.000Z'), end: new Date('2026-06-15T08:00:00.000Z') },
      ],
      requestedStart: new Date('2026-06-15T08:00:00.000Z'),
      requestedEnd: new Date('2026-06-15T09:00:00.000Z'),
    });
    expect(available).toBe(true);
  });

  it('accounts for the buffer footprint — rejects when buffer would overlap the next booking', () => {
    const available = isSlotAvailable({
      ...baseSlotInput,
      bookedIntervals: [
        { start: new Date('2026-06-15T08:00:00.000Z'), end: new Date('2026-06-15T09:00:00.000Z') },
      ],
      serviceBufferMinutes: 15,
      requestedStart: new Date('2026-06-15T07:00:00.000Z'),
      requestedEnd: new Date('2026-06-15T08:00:00.000Z'), // ends exactly when next starts, but +15min buffer overlaps it
    });
    expect(available).toBe(false);
  });

  it('returns false when the requested interval falls inside a blocked interval', () => {
    const available = isSlotAvailable({
      ...baseSlotInput,
      blockedIntervals: [
        { start: new Date('2026-06-15T09:00:00.000Z'), end: new Date('2026-06-15T11:00:00.000Z') },
      ],
      requestedStart: new Date('2026-06-15T09:30:00.000Z'),
      requestedEnd: new Date('2026-06-15T10:30:00.000Z'),
    });
    expect(available).toBe(false);
  });
});
