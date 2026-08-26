import { isValidObjectId } from 'mongoose';

import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { bookingAttachmentService } from '../services/bookingAttachmentService.instance.js';

function requireAuth(tenantAuth: { userId: string; companyId: string; role: string } | undefined): {
  userId: string;
  companyId: string;
  role: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

/**
 * Returns the booking so callers can check `employeeId` against the
 * caller — throws NotFoundError if it doesn't exist in this company
 * (tenant-scoped, same anti-enumeration shape as every other
 * `requireXInCompany` helper in this codebase).
 */
async function requireBookingInCompany(
  bookingId: string,
  companyId: string,
): Promise<{ employeeId: unknown }> {
  if (!isValidObjectId(bookingId)) {
    throw new ValidationError('Invalid booking id.');
  }
  const booking = await bookingRepository.findByIdInCompany(bookingId, companyId);
  if (!booking) {
    throw new NotFoundError('Booking not found.');
  }
  return booking;
}

/**
 * dev-tasks.md §14: "Display only to authorized master." Owner/admin/
 * manager can view any booking's attachments (matches
 * canManageAttachments' role set on the write side below); an
 * 'employee'-role caller may only view attachments for a booking
 * assigned to THEM — resolved via Employee.userId (employee.model.ts's
 * optional link back to the login account), never trusted from the
 * request. A caller with no linked Employee entry at all (e.g. an
 * owner/admin login not on the bookable roster) is treated the same as
 * a non-matching employee: forbidden.
 */
async function requireAttachmentViewAccess(
  booking: { employeeId: unknown },
  tenantAuth: { userId: string; companyId: string; role: string },
): Promise<void> {
  if (['owner', 'admin', 'manager'].includes(tenantAuth.role)) {
    return;
  }
  const employee = await employeeRepository.findByUserIdInCompany(
    tenantAuth.userId,
    tenantAuth.companyId,
  );
  if (!employee || String(employee._id) !== String(booking.employeeId)) {
    throw new ForbiddenError('You do not have access to this booking.');
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
  const tenantAuth = requireAuth(req.tenantAuth);
  const bookingId = requireParam(req.params.bookingId, 'bookingId');
  const booking = await requireBookingInCompany(bookingId, tenantAuth.companyId);
  await requireAttachmentViewAccess(booking, tenantAuth);

  const attachments = await bookingAttachmentService.listForBooking(
    tenantAuth.companyId,
    bookingId,
  );
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
  const tenantAuth = requireAuth(req.tenantAuth);
  const bookingId = requireParam(req.params.bookingId, 'bookingId');
  const attachmentId = requireParam(req.params.attachmentId, 'attachmentId');
  const booking = await requireBookingInCompany(bookingId, tenantAuth.companyId);
  await requireAttachmentViewAccess(booking, tenantAuth);

  if (!isValidObjectId(attachmentId)) {
    throw new ValidationError('Invalid attachment id.');
  }

  const { buffer, mimeType } = await bookingAttachmentService.getAttachmentContent(
    tenantAuth.companyId,
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
