import { DateTime } from 'luxon';

/** e.g. "Mon 15 Jun at 10:00" — in the company's own timezone, never UTC. */
export function formatAppointmentTime(startAt: Date, timezone: string): string {
  return DateTime.fromJSDate(startAt, { zone: timezone }).toFormat("EEE d LLL 'at' HH:mm");
}

export function bookingConfirmationMessage(input: {
  companyName: string;
  serviceName: string;
  startAt: Date;
  timezone: string;
}): string {
  const when = formatAppointmentTime(input.startAt, input.timezone);
  return `Your ${input.serviceName} appointment at ${input.companyName} is confirmed for ${when}.`;
}

/**
 * Public-booking variant of bookingConfirmationMessage — same base
 * wording (composed from it, not duplicated), plus the customer's
 * self-service management link. Extracted from publicController.ts,
 * where it used to be built inline with a raw UTC ISO timestamp instead
 * of the company's local time — closing HANDOFF_2.md §4 item 5, and
 * fixing that inconsistency with the tenant-flow message convention
 * along the way (customers should see local time, matching every other
 * SMS this file sends, not a raw UTC ISO string).
 */
export function publicBookingConfirmationMessage(input: {
  companyName: string;
  serviceName: string;
  startAt: Date;
  timezone: string;
  managementUrl: string;
}): string {
  const base = bookingConfirmationMessage(input);
  return `${base} Manage it here: ${input.managementUrl}`;
}

export function cancellationMessage(input: {
  companyName: string;
  serviceName: string;
  startAt: Date;
  timezone: string;
}): string {
  const when = formatAppointmentTime(input.startAt, input.timezone);
  return `Your ${input.serviceName} appointment at ${input.companyName} on ${when} has been cancelled.`;
}

export function rescheduleMessage(input: {
  companyName: string;
  serviceName: string;
  startAt: Date;
  timezone: string;
}): string {
  const when = formatAppointmentTime(input.startAt, input.timezone);
  return `Your ${input.serviceName} appointment at ${input.companyName} has been moved to ${when}.`;
}

export function reminderMessage(input: {
  companyName: string;
  serviceName: string;
  startAt: Date;
  timezone: string;
  hoursBefore: 24 | 2;
}): string {
  const when = formatAppointmentTime(input.startAt, input.timezone);
  return `Reminder: your ${input.serviceName} appointment at ${input.companyName} is on ${when}.`;
}
