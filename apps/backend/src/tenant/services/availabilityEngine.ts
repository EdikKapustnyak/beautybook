import { DateTime } from 'luxon';

import type {
  WeeklySchedule,
  Weekday,
  WorkingPeriod,
} from '../../shared/validation/workingHours.js';

export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface AvailabilitySlot {
  start: Date;
  end: Date;
}

export interface CalculateAvailableSlotsInput {
  /** Calendar date in the company's timezone, "YYYY-MM-DD". */
  date: string;
  /** IANA timezone identifier, e.g. "Europe/Oslo". */
  timezone: string;
  workingHours: WeeklySchedule;
  /** Already fetched, tenant-scoped, for this date — company-wide + employee-specific merged. */
  blockedIntervals: TimeInterval[];
  /** Already fetched, tenant-scoped, for this employee on this date. Empty until Stage 10 (Booking) wires in real reservations. */
  bookedIntervals: TimeInterval[];
  serviceDurationMinutes: number;
  serviceBufferMinutes: number;
  /** Candidate slot start times step by this many minutes. */
  slotGranularityMinutes?: number;
  /** Slots starting before this instant are excluded. Defaults to `new Date()`. */
  now?: Date;
}

const DEFAULT_SLOT_GRANULARITY_MINUTES = 15;

// luxon's `weekday` is 1=Monday..7=Sunday, matching WEEKDAYS' order exactly.
const LUXON_WEEKDAY_TO_NAME: Record<number, Weekday> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
};

function wallTimeToUtc(date: string, time: string, timezone: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!dt.isValid) {
    throw new RangeError(
      `Could not resolve "${date} ${time}" in timezone "${timezone}": ${dt.invalidReason ?? 'invalid'}`,
    );
  }
  return dt.toUTC().toJSDate();
}

/**
 * UTC instants for the start (inclusive) and end (exclusive) of a
 * calendar date in the given timezone — e.g. for querying "which blocked
 * intervals / bookings overlap this calendar date". Exported so callers
 * fetching data for `calculateAvailableSlots` can query the right range.
 */
export function getDayBoundsUtc(date: string, timezone: string): TimeInterval {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  if (!start.isValid) {
    throw new RangeError(`Invalid date "${date}": ${start.invalidReason ?? 'invalid'}`);
  }
  const end = start.plus({ days: 1 });
  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Sorts and merges overlapping/touching intervals into the minimal
 * non-overlapping set. Touching counts as overlapping (a 12:00-13:00
 * blocked interval merges with an adjacent 13:00-14:00 one) — the
 * conservative/safe direction for things being SUBTRACTED from
 * availability (breaks, blocked time, existing bookings).
 */
function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const first = sorted[0];
  if (!first) {
    return [];
  }

  const merged: TimeInterval[] = [];
  let current: TimeInterval = { start: first.start, end: first.end };

  for (const next of sorted.slice(1)) {
    if (next.start.getTime() <= current.end.getTime()) {
      if (next.end.getTime() > current.end.getTime()) {
        current = { start: current.start, end: next.end };
      }
    } else {
      merged.push(current);
      current = { start: next.start, end: next.end };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Returns `base` with every overlapping portion of `subtract` removed.
 * Both inputs may be unsorted/overlapping; `subtract` is merged first.
 */
function subtractIntervals(base: TimeInterval[], subtract: TimeInterval[]): TimeInterval[] {
  const merged = mergeIntervals(subtract);
  let remaining = base.map((interval) => ({ ...interval }));

  for (const cut of merged) {
    const next: TimeInterval[] = [];
    for (const interval of remaining) {
      if (
        cut.end.getTime() <= interval.start.getTime() ||
        cut.start.getTime() >= interval.end.getTime()
      ) {
        // No overlap at all.
        next.push(interval);
        continue;
      }
      // Left remainder.
      if (cut.start.getTime() > interval.start.getTime()) {
        next.push({ start: interval.start, end: cut.start });
      }
      // Right remainder.
      if (cut.end.getTime() < interval.end.getTime()) {
        next.push({ start: cut.end, end: interval.end });
      }
    }
    remaining = next;
  }

  return remaining;
}

function computeFreeIntervalsForDate(
  date: string,
  timezone: string,
  workingHours: WeeklySchedule,
  occupied: TimeInterval[],
): TimeInterval[] {
  const dateTime = DateTime.fromISO(date, { zone: timezone });
  if (!dateTime.isValid) {
    throw new RangeError(`Invalid date "${date}": ${dateTime.invalidReason ?? 'invalid'}`);
  }

  const weekday = LUXON_WEEKDAY_TO_NAME[dateTime.weekday];
  const periods: WorkingPeriod[] = weekday ? (workingHours[weekday] ?? []) : [];
  if (periods.length === 0) {
    return [];
  }

  const free: TimeInterval[] = [];
  for (const period of periods) {
    const periodStart = wallTimeToUtc(date, period.start, timezone);
    const periodEnd = wallTimeToUtc(date, period.end, timezone);

    const breakIntervals: TimeInterval[] = (period.breaks ?? []).map((breakRange) => ({
      start: wallTimeToUtc(date, breakRange.start, timezone),
      end: wallTimeToUtc(date, breakRange.end, timezone),
    }));

    free.push(
      ...subtractIntervals(
        [{ start: periodStart, end: periodEnd }],
        [...breakIntervals, ...occupied],
      ),
    );
  }

  return free;
}

function generateSlotsWithinInterval(
  interval: TimeInterval,
  footprintMinutes: number,
  visibleDurationMinutes: number,
  granularityMinutes: number,
  now: Date,
): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  let cursor = interval.start;

  while (addMinutes(cursor, footprintMinutes).getTime() <= interval.end.getTime()) {
    if (cursor.getTime() >= now.getTime()) {
      slots.push({ start: cursor, end: addMinutes(cursor, visibleDurationMinutes) });
    }
    cursor = addMinutes(cursor, granularityMinutes);
  }

  return slots;
}

/**
 * Implements technical-spec.md §8 steps 5-11 for a single calendar date:
 * working hours -> breaks -> blocked intervals -> existing bookings ->
 * duration+buffer -> candidate slots -> remove conflicts -> DTO-shaped
 * slots. Pure/synchronous — no I/O, so it's fully unit-testable and safe
 * to reuse both for the tenant calendar view (this stage) and the public
 * booking flow's server-side recheck (dev-tasks.md §10) later.
 */
export function calculateAvailableSlots(input: CalculateAvailableSlotsInput): AvailabilitySlot[] {
  const granularity = input.slotGranularityMinutes ?? DEFAULT_SLOT_GRANULARITY_MINUTES;
  const footprintMinutes = input.serviceDurationMinutes + input.serviceBufferMinutes;
  const now = input.now ?? new Date();
  const occupied = [...input.blockedIntervals, ...input.bookedIntervals];

  const freeIntervals = computeFreeIntervalsForDate(
    input.date,
    input.timezone,
    input.workingHours,
    occupied,
  );

  const allSlots: AvailabilitySlot[] = [];
  for (const freeInterval of freeIntervals) {
    allSlots.push(
      ...generateSlotsWithinInterval(
        freeInterval,
        footprintMinutes,
        input.serviceDurationMinutes,
        granularity,
        now,
      ),
    );
  }

  allSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return allSlots;
}

export interface IsSlotAvailableInput {
  /** The exact requested interval (service duration only, NOT including buffer). */
  requestedStart: Date;
  requestedEnd: Date;
  /** Calendar date, in the company's timezone, that `requestedStart` falls on — "YYYY-MM-DD". */
  date: string;
  timezone: string;
  workingHours: WeeklySchedule;
  blockedIntervals: TimeInterval[];
  bookedIntervals: TimeInterval[];
  serviceBufferMinutes: number;
}

/**
 * Server-side availability RECHECK for booking creation — technical-spec.md
 * §8: "Проверка доступности при создании записи должна повторяться на
 * backend непосредственно перед записью. Нельзя доверять списку слотов,
 * который ранее получил frontend." Checks that the EXACT requested
 * interval (not a generated candidate) is still free, including its
 * buffer footprint.
 *
 * This is a fast, friendly-error fast-path — it is NOT what actually
 * prevents a race between two concurrent requests for the same time (that
 * guarantee comes from the atomic SlotLock reservation in
 * bookingService.ts). This check exists so a genuinely-unavailable request
 * gets rejected with a clear reason before attempting a reservation.
 */
export function isSlotAvailable(input: IsSlotAvailableInput): boolean {
  const footprintEnd = addMinutes(input.requestedEnd, input.serviceBufferMinutes);
  const occupied = [...input.blockedIntervals, ...input.bookedIntervals];

  const freeIntervals = computeFreeIntervalsForDate(
    input.date,
    input.timezone,
    input.workingHours,
    occupied,
  );

  return freeIntervals.some(
    (free) =>
      input.requestedStart.getTime() >= free.start.getTime() &&
      footprintEnd.getTime() <= free.end.getTime(),
  );
}
