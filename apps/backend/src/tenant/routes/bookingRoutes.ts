import { Router } from 'express';

import {
  createBooking,
  getBooking,
  listBookings,
  rescheduleBooking,
  updateBookingNotes,
  updateBookingStatus,
} from '../controllers/bookingController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const bookingRouter: Router = Router();

const canManageBookingSchedule = requireTenantRole('owner', 'admin', 'manager');

bookingRouter.get('/', requireTenantAuth, listBookings);
bookingRouter.get('/:id', requireTenantAuth, getBooking);
bookingRouter.post('/', requireTenantAuth, createBooking);
bookingRouter.patch('/:id', requireTenantAuth, updateBookingNotes);
bookingRouter.patch(
  '/:id/status',
  requireTenantAuth,
  canManageBookingSchedule,
  updateBookingStatus,
);
bookingRouter.post(
  '/:id/reschedule',
  requireTenantAuth,
  canManageBookingSchedule,
  rescheduleBooking,
);
