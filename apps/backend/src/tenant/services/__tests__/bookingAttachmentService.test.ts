import { describe, expect, it, vi } from 'vitest';

import { createInMemoryStorage } from '../../../shared/storage/__tests__/inMemoryStorage.js';
import { createBookingAttachmentService } from '../bookingAttachmentService.js';
import { createInMemoryAttachmentRepo } from './inMemoryStoragePorts.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const HTML_BYTES = Buffer.from('<html><script>alert(1)</script></html>', 'ascii');
const COMPANY_ID = 'company-1';
const BOOKING_ID = 'booking-1';

function buildService(now?: () => Date) {
  const storage = createInMemoryStorage();
  const attachmentRepo = createInMemoryAttachmentRepo();
  const service = createBookingAttachmentService({
    attachmentRepo,
    storage,
    maxSizeBytes: 8 * 1024 * 1024,
    retentionDays: 30,
    now,
  });
  return { service, storage, attachmentRepo };
}

describe('bookingAttachmentService.uploadAttachment', () => {
  it('stores the object, sets expiresAt from the retention window, and creates a record', async () => {
    const fixedNow = new Date('2026-01-01T00:00:00.000Z');
    const { service, storage } = buildService(() => fixedNow);

    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    expect(storage.has(attachment.storageKey)).toBe(true);
    expect(attachment.expiresAt).toEqual(new Date('2026-01-31T00:00:00.000Z'));
    expect(attachment.status).toBe('active');
  });

  it('scopes the storage key under company AND booking, not user-controlled input', async () => {
    const { service } = buildService();
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);
    expect(
      attachment.storageKey.startsWith(`booking-attachments/${COMPANY_ID}/${BOOKING_ID}/`),
    ).toBe(true);
  });

  it('rejects an invalid file and never writes to storage', async () => {
    const { service, storage } = buildService();
    await expect(
      service.uploadAttachment(COMPANY_ID, BOOKING_ID, HTML_BYTES),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(storage.size()).toBe(0);
  });

  it('rejects a file exceeding the attachment size limit', async () => {
    const { service } = buildService();
    const oversized = Buffer.concat([JPEG_BYTES, Buffer.alloc(9 * 1024 * 1024)]);
    await expect(service.uploadAttachment(COMPANY_ID, BOOKING_ID, oversized)).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    );
  });
});

describe('bookingAttachmentService.getAttachmentContent', () => {
  it('returns the buffer and mimeType for an authorized request', async () => {
    const { service } = buildService();
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    const content = await service.getAttachmentContent(COMPANY_ID, attachment.id);
    expect(content.mimeType).toBe('image/jpeg');
    expect(content.buffer.equals(JPEG_BYTES)).toBe(true);
  });

  it('cannot be accessed cross-tenant — same NotFoundError as a bad id (no enumeration)', async () => {
    const { service } = buildService();
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    await expect(
      service.getAttachmentContent('another-company', attachment.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('cannot be accessed after deletion (authorization effectively removed)', async () => {
    const { service } = buildService();
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);
    await service.deleteAttachment(COMPANY_ID, attachment.id);

    await expect(service.getAttachmentContent(COMPANY_ID, attachment.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('bookingAttachmentService.deleteAttachment', () => {
  it('removes the storage object and marks the record deleted', async () => {
    const { service, storage } = buildService();
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    await service.deleteAttachment(COMPANY_ID, attachment.id);

    expect(storage.has(attachment.storageKey)).toBe(false);
  });

  it('throws NotFoundError for a cross-tenant delete attempt, and leaves the object in storage', async () => {
    const { service, storage } = buildService();
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    await expect(service.deleteAttachment('another-company', attachment.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(storage.has(attachment.storageKey)).toBe(true);
  });
});

describe('bookingAttachmentService.cleanupExpiredAttachments', () => {
  it('deletes storage objects and marks DB records for expired attachments', async () => {
    const uploadTime = new Date('2026-01-01T00:00:00.000Z');
    const { service, storage, attachmentRepo } = buildService(() => uploadTime);
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    const laterService = createBookingAttachmentService({
      attachmentRepo,
      storage,
      maxSizeBytes: 8 * 1024 * 1024,
      retentionDays: 30,
      now: () => new Date('2026-02-01T00:00:01.000Z'),
    });

    const result = await laterService.cleanupExpiredAttachments();

    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(storage.has(attachment.storageKey)).toBe(false);
  });

  it('leaves non-expired attachments completely untouched', async () => {
    const { service, storage } = buildService(() => new Date('2026-01-01T00:00:00.000Z'));
    const attachment = await service.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    const result = await service.cleanupExpiredAttachments();

    expect(result.deletedCount).toBe(0);
    expect(storage.has(attachment.storageKey)).toBe(true);
  });

  it('FAILED CLEANUP IS RETRIED: a storage failure leaves the record active for the next run', async () => {
    const uploadTime = new Date('2026-01-01T00:00:00.000Z');
    const storage = createInMemoryStorage();
    const attachmentRepo = createInMemoryAttachmentRepo();
    const uploadService = createBookingAttachmentService({
      attachmentRepo,
      storage,
      maxSizeBytes: 8 * 1024 * 1024,
      retentionDays: 30,
      now: () => uploadTime,
    });
    const attachment = await uploadService.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    const failingStorage = {
      ...storage,
      deleteObject: vi.fn().mockRejectedValueOnce(new Error('storage unavailable')),
    };
    const failingCleanupService = createBookingAttachmentService({
      attachmentRepo,
      storage: failingStorage,
      maxSizeBytes: 8 * 1024 * 1024,
      retentionDays: 30,
      now: () => new Date('2026-02-01T00:00:01.000Z'),
    });

    const firstRun = await failingCleanupService.cleanupExpiredAttachments();
    expect(firstRun.deletedCount).toBe(0);
    expect(firstRun.failedCount).toBe(1);

    const stillActive = await attachmentRepo.findByIdInCompany(attachment.id, COMPANY_ID);
    expect(stillActive?.status).toBe('active');

    const retryService = createBookingAttachmentService({
      attachmentRepo,
      storage,
      maxSizeBytes: 8 * 1024 * 1024,
      retentionDays: 30,
      now: () => new Date('2026-02-01T00:00:02.000Z'),
    });
    const secondRun = await retryService.cleanupExpiredAttachments();

    expect(secondRun.deletedCount).toBe(1);
    expect(secondRun.failedCount).toBe(0);
    expect(storage.has(attachment.storageKey)).toBe(false);
  });

  it('one failing item does not abort cleanup of the rest of the batch', async () => {
    const uploadTime = new Date('2026-01-01T00:00:00.000Z');
    const storage = createInMemoryStorage();
    const attachmentRepo = createInMemoryAttachmentRepo();
    const uploadService = createBookingAttachmentService({
      attachmentRepo,
      storage,
      maxSizeBytes: 8 * 1024 * 1024,
      retentionDays: 30,
      now: () => uploadTime,
    });
    const attachmentA = await uploadService.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);
    const attachmentB = await uploadService.uploadAttachment(COMPANY_ID, BOOKING_ID, JPEG_BYTES);

    const failingStorage = {
      ...storage,
      deleteObject: vi.fn(async (key: string) => {
        if (key === attachmentA.storageKey) {
          throw new Error('storage unavailable for this one object');
        }
        await storage.deleteObject(key);
      }),
    };
    const cleanupService = createBookingAttachmentService({
      attachmentRepo,
      storage: failingStorage,
      maxSizeBytes: 8 * 1024 * 1024,
      retentionDays: 30,
      now: () => new Date('2026-02-01T00:00:01.000Z'),
    });

    const result = await cleanupService.cleanupExpiredAttachments();

    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(storage.has(attachmentB.storageKey)).toBe(false);
    expect(storage.has(attachmentA.storageKey)).toBe(true);
  });

  it('running cleanup twice in a row with nothing new expired is a safe no-op', async () => {
    const { service } = buildService(() => new Date('2026-01-01T00:00:00.000Z'));
    await service.cleanupExpiredAttachments();
    const second = await service.cleanupExpiredAttachments();
    expect(second.deletedCount).toBe(0);
    expect(second.failedCount).toBe(0);
  });
});
