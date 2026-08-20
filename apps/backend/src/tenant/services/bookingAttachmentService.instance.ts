import { env } from '../../config/env.js';
import { s3Storage } from '../../shared/storage/s3Storage.js';
import { mongoBookingAttachmentRepositoryPort } from '../repositories/storageRepositoryAdapters.js';
import { createBookingAttachmentService } from './bookingAttachmentService.js';

export const bookingAttachmentService = createBookingAttachmentService({
  attachmentRepo: mongoBookingAttachmentRepositoryPort,
  storage: s3Storage,
  maxSizeBytes: env.BOOKING_ATTACHMENT_MAX_SIZE_BYTES,
  retentionDays: env.BOOKING_ATTACHMENT_RETENTION_DAYS,
});
