import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { NotificationModel } from '../notification.model.js';

function buildValidNotification(overrides: Record<string, unknown> = {}) {
  return new NotificationModel({
    companyId: new Types.ObjectId(),
    type: 'booking_confirmation',
    recipient: '+4791234567',
    body: 'Your booking is confirmed.',
    dedupeKey: 'booking-1:booking_confirmation',
    scheduledAt: new Date(),
    ...overrides,
  });
}

describe('NotificationModel validation', () => {
  it('accepts a well-formed notification', () => {
    const notification = buildValidNotification();
    expect(notification.validateSync()).toBeUndefined();
  });

  it('requires companyId, type, recipient, body, dedupeKey, scheduledAt', () => {
    for (const field of ['companyId', 'type', 'recipient', 'body', 'dedupeKey', 'scheduledAt']) {
      const notification = buildValidNotification({ [field]: undefined });
      expect(notification.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it('rejects an invalid type', () => {
    const notification = buildValidNotification({ type: 'made_up' });
    expect(notification.validateSync()?.errors.type).toBeDefined();
  });

  it('defaults channel to "sms"', () => {
    const notification = buildValidNotification();
    expect(notification.channel).toBe('sms');
  });

  it('defaults status to "pending"', () => {
    const notification = buildValidNotification();
    expect(notification.status).toBe('pending');
  });

  it('defaults attempts to 0 and maxAttempts to 3', () => {
    const notification = buildValidNotification();
    expect(notification.attempts).toBe(0);
    expect(notification.maxAttempts).toBe(3);
  });

  it('accepts an optional bookingId', () => {
    const notification = buildValidNotification({ bookingId: new Types.ObjectId() });
    expect(notification.validateSync()).toBeUndefined();
  });
});
