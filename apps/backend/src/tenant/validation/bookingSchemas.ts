import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';
import { isPlainText } from '../../shared/validation/plainText.js';
import { BOOKING_STATUSES } from '../models/booking.model.js';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');
const noteSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(isPlainText, 'Must not contain HTML tags or angle brackets.');

export const createBookingSchema = z
  .object({
    employeeId: objectIdSchema,
    serviceId: objectIdSchema,
    startAt: z.coerce.date(),
    customer: z
      .object({
        name: z.string().trim().min(1).max(200),
        phone: z.string().trim().min(6).max(32),
        email: z.string().trim().toLowerCase().email().max(254).optional(),
      })
      .strict(),
    customerNote: noteSchema.optional(),
    internalNote: noteSchema.optional(),
  })
  .strict()
  .refine((data) => data.startAt.getTime() > Date.now(), {
    message: 'Cannot create a booking that starts in the past.',
    path: ['startAt'],
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingStatusSchema = z
  .object({
    status: z.enum(BOOKING_STATUSES),
    cancellationReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => data.status !== 'cancelled' || Boolean(data.cancellationReason), {
    message: 'cancellationReason is required when cancelling a booking.',
    path: ['cancellationReason'],
  });
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;

export const listBookingsQuerySchema = paginationQuerySchema.extend({
  employeeId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const rescheduleBookingSchema = z
  .object({
    startAt: z.coerce.date(),
  })
  .strict()
  .refine((data) => data.startAt.getTime() > Date.now(), {
    message: 'Cannot reschedule a booking to start in the past.',
    path: ['startAt'],
  });
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const updateBookingNotesSchema = z
  .object({
    customerNote: noteSchema.optional(),
    internalNote: noteSchema.optional(),
  })
  .strict()
  .refine((data) => data.customerNote !== undefined || data.internalNote !== undefined, {
    message: 'At least one of customerNote or internalNote must be provided.',
  });
export type UpdateBookingNotesInput = z.infer<typeof updateBookingNotesSchema>;
