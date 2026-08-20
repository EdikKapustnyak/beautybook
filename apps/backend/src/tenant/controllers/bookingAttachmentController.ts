import { isValidObjectId } from 'mongoose';

import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { bookingAttachmentService } from '../services/bookingAttachmentService.instance.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

async function requireBookingInCompany(bookingId: string, companyId: string): Promise<void> {
  if (!isValidObjectId(bookingId)) {
    throw new ValidationError('Invalid booking id.');
  }
  const booking = await bookingRepository.findByIdInCompany(bookingId, companyId);
  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }
}

export const uploadBookingAttachment = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const bookingId = requireParam(req.params.bookingId, 'bookingId');
  await requireBookingInCompany(bookingId, companyId);

  if (!req.file) {
    throw new ValidationError('No file was uploaded (expected form field "file").');
  }

  const attachment = await bookingAttachmentService.uploadAttachment(
    companyId,
    bookingId,
    req.file.buffer,
  );
  // Deliberately omit storageKey from the response — internal detail, not
  // needed by any client. See security-measures.md §11.
  res.status(201).json({
    success: true,
    data: {
      attachment: {
        id: attachment.id,
        bookingId: attachment.bookingId,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        expiresAt: attachment.expiresAt,
      },
    },
  });
});

export const listBookingAttachments = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const bookingId = requireParam(req.params.bookingId, 'bookingId');
  await requireBookingInCompany(bookingId, companyId);

  const attachments = await bookingAttachmentService.listForBooking(companyId, bookingId);
  res.status(200).json({
    success: true,
    data: {
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        bookingId: attachment.bookingId,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        expiresAt: attachment.expiresAt,
      })),
    },
  });
});

/**
 * The ONLY way to read a booking attachment's bytes — there is no public
 * URL for these. Streams the content back after the same tenant-auth +
 * company-membership check every other endpoint uses. See
 * security-measures.md §11 "access только через authorized endpoint".
 */
export const getBookingAttachmentContent = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const bookingId = requireParam(req.params.bookingId, 'bookingId');
  const attachmentId = requireParam(req.params.attachmentId, 'attachmentId');
  await requireBookingInCompany(bookingId, companyId);

  if (!isValidObjectId(attachmentId)) {
    throw new ValidationError('Invalid attachment id.');
  }

  const { buffer, mimeType } = await bookingAttachmentService.getAttachmentContent(
    companyId,
    attachmentId,
  );

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(buffer);
});

export const deleteBookingAttachment = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const bookingId = requireParam(req.params.bookingId, 'bookingId');
  const attachmentId = requireParam(req.params.attachmentId, 'attachmentId');
  await requireBookingInCompany(bookingId, companyId);

  if (!isValidObjectId(attachmentId)) {
    throw new ValidationError('Invalid attachment id.');
  }

  await bookingAttachmentService.deleteAttachment(companyId, attachmentId);
  res.status(200).json({ success: true, data: {} });
});
