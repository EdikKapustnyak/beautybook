export interface ReminderTimes {
  /** undefined if this reminder's target time has already passed relative to `now`. */
  reminder24hAt?: Date;
  reminder2hAt?: Date;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * "24 hours before the appointment" means 24 real elapsed hours, not "the
 * same wall-clock time the previous day" — so this is pure millisecond
 * arithmetic on the already-UTC `startAt` instant. No timezone conversion
 * happens here at all, which is exactly why it's correct across DST
 * transitions without any special handling: subtracting a fixed duration
 * from a UTC instant is unaffected by what the wall clock is doing in any
 * particular timezone in between. (Contrast with the availability engine,
 * which genuinely needs DST-aware wall-clock-to-UTC conversion because it
 * works with company-local working hours — a fundamentally different
 * problem.)
 */
export function computeReminderTimes(startAt: Date, now: Date = new Date()): ReminderTimes {
  const at24h = new Date(startAt.getTime() - 24 * HOUR_MS);
  const at2h = new Date(startAt.getTime() - 2 * HOUR_MS);

  return {
    reminder24hAt: at24h.getTime() > now.getTime() ? at24h : undefined,
    reminder2hAt: at2h.getTime() > now.getTime() ? at2h : undefined,
  };
}
