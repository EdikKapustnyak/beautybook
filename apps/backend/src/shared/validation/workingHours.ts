const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface TimeRange {
  start: string; // "HH:mm", 24h, e.g. "09:00"
  end: string;
}

export interface WorkingPeriod extends TimeRange {
  breaks?: TimeRange[];
}

export type WeeklySchedule = Partial<Record<Weekday, WorkingPeriod[]>>;

export function isValidTimeFormat(value: string): boolean {
  return TIME_PATTERN.test(value);
}

function timeToMinutes(time: string): number {
  const [hoursStr, minutesStr] = time.split(':');
  return Number(hoursStr ?? 0) * 60 + Number(minutesStr ?? 0);
}

function validateRangeFormat(range: TimeRange, label: string): string | null {
  if (!isValidTimeFormat(range.start) || !isValidTimeFormat(range.end)) {
    return `${label} "${range.start}-${range.end}" must use 24h "HH:mm" format.`;
  }
  return null;
}

function validateDayPeriods(day: Weekday, periods: WorkingPeriod[]): string | null {
  const sorted = [...periods].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  let previous: WorkingPeriod | null = null;
  for (const period of sorted) {
    const formatError = validateRangeFormat(period, `${day} working period`);
    if (formatError) {
      return formatError;
    }

    const startMin = timeToMinutes(period.start);
    const endMin = timeToMinutes(period.end);

    // MVP scope decision: overnight/midnight-crossing periods (e.g.
    // 22:00-02:00) are not supported. A period must end after it starts,
    // on the same calendar day. Revisit if a real business needs
    // overnight bookings.
    if (endMin <= startMin) {
      return `${day} working period "${period.start}-${period.end}" must end after it starts (overnight periods are not supported).`;
    }

    if (previous && startMin < timeToMinutes(previous.end)) {
      return `${day} has overlapping working periods: "${previous.start}-${previous.end}" and "${period.start}-${period.end}".`;
    }

    const breaksError = validateBreaks(day, period);
    if (breaksError) {
      return breaksError;
    }

    previous = period;
  }

  return null;
}

function validateBreaks(day: Weekday, period: WorkingPeriod): string | null {
  if (!period.breaks || period.breaks.length === 0) {
    return null;
  }

  const periodStart = timeToMinutes(period.start);
  const periodEnd = timeToMinutes(period.end);
  const sortedBreaks = [...period.breaks].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
  );

  let previous: TimeRange | null = null;
  for (const breakRange of sortedBreaks) {
    const formatError = validateRangeFormat(breakRange, `${day} break`);
    if (formatError) {
      return formatError;
    }

    const breakStart = timeToMinutes(breakRange.start);
    const breakEnd = timeToMinutes(breakRange.end);

    if (breakEnd <= breakStart) {
      return `${day} break "${breakRange.start}-${breakRange.end}" must end after it starts.`;
    }
    if (breakStart < periodStart || breakEnd > periodEnd) {
      return `${day} break "${breakRange.start}-${breakRange.end}" must fall within the working period "${period.start}-${period.end}".`;
    }
    if (previous && breakStart < timeToMinutes(previous.end)) {
      return `${day} has overlapping breaks: "${previous.start}-${previous.end}" and "${breakRange.start}-${breakRange.end}".`;
    }

    previous = breakRange;
  }

  return null;
}

/**
 * Returns the first validation error found in the schedule, or `null` if
 * it's fully valid. Timezone/DST is deliberately out of scope here — this
 * validates a wall-clock weekly template only. DST-correct date arithmetic
 * happens when the availability engine (dev-tasks.md §9) projects this
 * template onto real calendar dates in the company's timezone.
 */
export function getWeeklyScheduleError(schedule: WeeklySchedule): string | null {
  for (const day of WEEKDAYS) {
    const periods = schedule[day];
    if (!periods || periods.length === 0) {
      continue;
    }
    const error = validateDayPeriods(day, periods);
    if (error) {
      return error;
    }
  }
  return null;
}

export function isValidWeeklySchedule(schedule: WeeklySchedule): boolean {
  return getWeeklyScheduleError(schedule) === null;
}
