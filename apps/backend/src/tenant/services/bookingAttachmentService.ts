import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { validateImageUpload } from '../../shared/storage/fileValidation.js';
import type { StoragePort } from '../../shared/storage/storagePort.js';
import { generateStorageKey } from '../../shared/storage/storageKey.js';
import type {
  BookingAttachmentRecord,
  BookingAttachmentRepositoryPort,
} from '../repositories/storageTypes.js';

export interface BookingAttachmentServiceDeps {
  attachmentRepo: BookingAttachmentRepositoryPort;
  storage: StoragePort;
  maxSizeBytes: number;
  retentionDays: number;
  now?: () => Date;
}

export interface CleanupResult {
  deletedCount: number;
  failedCount: number;
}

export function createBookingAttachmentService(deps: BookingAttachmentServiceDeps) {
  const { attachmentRepo, storage, maxSizeBytes, retentionDays } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async uploadAttachment(
      companyId: string,
      bookingId: string,
      buffer: Buffer,
    ): Promise<BookingAttachmentRecord> {
      const validation = validateImageUpload(buffer, maxSizeBytes);
      if (!validation.valid || !validation.mimeType) {
        throw new ValidationError(validation.error ?? 'Invalid image upload.');
      }

      const storageKey = generateStorageKey(
        `booking-attachments/${companyId}/${bookingId}`,
        validation.mimeType,
      );
      await storage.putObject(storageKey, buffer, validation.mimeType);

      const expiresAt = new Date(now().getTime() + retentionDays * 24 * 60 * 60 * 1000);

      return attachmentRepo.create(companyId, {
        bookingId,
        storageKey,
        mimeType: validation.mimeType,
        sizeBytes: buffer.length,
        expiresAt,
      });
    },

    async listForBooking(companyId: string, bookingId: string): Promise<BookingAttachmentRecord[]> {
      return attachmentRepo.listForBookingInCompany(bookingId, companyId);
    },

    /**
     * Only ever called from an authenticated, tenant-scoped controller
     * (`findByIdInCompany` enforces that) — there is no public endpoint
     * for booking attachments. See security-measures.md §11.
     */
    async getAttachmentContent(
      companyId: string,
      attachmentId: string,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
      const attachment = await attachmentRepo.findByIdInCompany(attachmentId, companyId);
      if (!attachment) {
        throw new NotFoundError('Attachment not found.');
      }
      const buffer = await storage.getObject(attachment.storageKey);
      return { buffer, mimeType: attachment.mimeType };
    },

    async deleteAttachment(companyId: string, attachmentId: string): Promise<void> {
      const attachment = await attachmentRepo.findByIdInCompany(attachmentId, companyId);
      if (!attachment) {
        throw new NotFoundError('Attachment not found.');
      }
      await storage.deleteObject(attachment.storageKey);
      await attachmentRepo.deleteByIdInCompany(attachmentId, companyId);
    },

    /**
     * dev-tasks.md §14 cleanup job. Runs across ALL companies (not
     * tenant-scoped — it's an internal maintenance job). For each expired
     * attachment: delete the storage object, THEN mark the DB record
     * deleted — in that order, so a storage failure leaves the record
     * `active` and it gets picked up again on the next run
     * ("failed cleanup retried"). One item failing never aborts the rest
     * of the batch.
     *
     * Not wired into a scheduler yet — BullMQ/Redis lands in a later
     * stage (dev-tasks.md §16/§17). Until then this is invoked from a
     * manually/cron-runnable CLI script, same pattern as
     * admin/scripts/createAdminUser.ts.
     */
    async cleanupExpiredAttachments(batchSize = 100): Promise<CleanupResult> {
      const expired = await attachmentRepo.findExpired(now(), batchSize);
      let deletedCount = 0;
      let failedCount = 0;

      for (const attachment of expired) {
        try {
          await storage.deleteObject(attachment.storageKey);
          const marked = await attachmentRepo.markDeletedIfActive(attachment.id);
          if (marked) {
            deletedCount += 1;
          }
        } catch {
          // Deliberately swallowed: this item stays `active` for the next
          // run to retry. Never let one bad object storage error abort
          // cleanup of everything else in the batch.
          failedCount += 1;
        }
      }

      return { deletedCount, failedCount };
    },
  };
}

export type BookingAttachmentService = ReturnType<typeof createBookingAttachmentService>;
