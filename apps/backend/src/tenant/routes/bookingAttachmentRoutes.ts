import { Router } from 'express';

import { env } from '../../config/env.js';
import { uploadSingleImage } from '../../shared/http/upload.js';
import {
  deleteBookingAttachment,
  getBookingAttachmentContent,
  listBookingAttachments,
  uploadBookingAttachment,
} from '../controllers/bookingAttachmentController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

// mergeParams so :bookingId from the parent router (mounted at
// /bookings/:bookingId/attachments) is visible on req.params here.
export const bookingAttachmentRouter: Router = Router({ mergeParams: true });

const canManageAttachments = requireTenantRole('owner', 'admin', 'manager');
const uploadMiddleware = uploadSingleImage(env.BOOKING_ATTACHMENT_MAX_SIZE_BYTES);

bookingAttachmentRouter.get('/', requireTenantAuth, listBookingAttachments);
bookingAttachmentRouter.get('/:attachmentId', requireTenantAuth, getBookingAttachmentContent);
bookingAttachmentRouter.post(
  '/',
  requireTenantAuth,
  canManageAttachments,
  uploadMiddleware,
  uploadBookingAttachment,
);
bookingAttachmentRouter.delete(
  '/:attachmentId',
  requireTenantAuth,
  canManageAttachments,
  deleteBookingAttachment,
);
