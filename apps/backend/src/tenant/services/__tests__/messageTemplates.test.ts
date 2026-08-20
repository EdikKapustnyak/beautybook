import { describe, expect, it } from 'vitest';

import {
  bookingConfirmationMessage,
  cancellationMessage,
  formatAppointmentTime,
  reminderMessage,
  rescheduleMessage,
} from '../messageTemplates.js';

describe('formatAppointmentTime', () => {
  it('formats a UTC instant in the company timezone, not UTC', () => {
    const result = formatAppointmentTime(new Date('2026-06-15T08:00:00.000Z'), 'Europe/Oslo');
    expect(result).toBe('Mon 15 Jun at 10:00');
  });

  it('formats the same instant differently in a different timezone', () => {
    const startAt = new Date('2026-06-15T08:00:00.000Z');
    const oslo = formatAppointmentTime(startAt, 'Europe/Oslo');
    const newYork = formatAppointmentTime(startAt, 'America/New_York');
    expect(oslo).not.toBe(newYork);
  });
});

const baseInput = {
  companyName: 'Glow Studio',
  serviceName: 'Manicure',
  startAt: new Date('2026-06-15T08:00:00.000Z'),
  timezone: 'Europe/Oslo',
};

describe('message templates', () => {
  it('bookingConfirmationMessage mentions the service, company, and local time', () => {
    const message = bookingConfirmationMessage(baseInput);
    expect(message).toContain('Manicure');
    expect(message).toContain('Glow Studio');
    expect(message).toContain('10:00');
  });

  it('cancellationMessage mentions cancellation', () => {
    expect(cancellationMessage(baseInput)).toMatch(/cancelled/i);
  });

  it('rescheduleMessage mentions the move', () => {
    expect(rescheduleMessage(baseInput)).toMatch(/moved/i);
  });

  it('reminderMessage mentions the appointment', () => {
    const message = reminderMessage({ ...baseInput, hoursBefore: 24 });
    expect(message).toMatch(/Reminder/i);
    expect(message).toContain('Manicure');
  });
});
