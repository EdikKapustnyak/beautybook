import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { BookingAttachmentModel } from '../bookingAttachment.model.js';

function buildValidAttachment(overrides: Record<string, unknown> = {}) {
  return new BookingAttachmentModel({
    companyId: new Types.ObjectId(),
    bookingId: new Types.ObjectId(),
    storageKey: 'booking-attachments/company-1/booking-1/abc.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 54321,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

describe('BookingAttachmentModel validation', () => {
  it('accepts a well-formed attachment', () => {
    const attachment = buildValidAttachment();
    expect(attachment.validateSync()).toBeUndefined();
  });

  it('requires companyId, bookingId, storageKey, mimeType, sizeBytes, expiresAt', () => {
    for (const field of [
      'companyId',
      'bookingId',
      'storageKey',
      'mimeType',
      'sizeBytes',
      'expiresAt',
    ]) {
      const attachment = buildValidAttachment({ [field]: undefined });
      expect(attachment.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it('rejects a zero or negative sizeBytes', () => {
    const attachment = buildValidAttachment({ sizeBytes: 0 });
    expect(attachment.validateSync()?.errors.sizeBytes).toBeDefined();
  });

  it('defaults status to "active"', () => {
    const attachment = buildValidAttachment();
    expect(attachment.status).toBe('active');
  });

  it('rejects an invalid status value', () => {
    const attachment = buildValidAttachment({ status: 'made_up' });
    expect(attachment.validateSync()?.errors.status).toBeDefined();
  });
});
