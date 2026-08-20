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
