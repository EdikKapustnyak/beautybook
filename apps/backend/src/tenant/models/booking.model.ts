import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'expired',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * `footprintEndAt` = `endAt` + the service's `bufferMinutes` at the time
 * of booking. It's what actually got reserved in SlotLock (see
 * slotLock.model.ts) — stored here so cancelling/no-showing a booking can
 * release the exact same lock cells without needing to re-look-up the
 * service's buffer (which may have changed since).
 *
 * NOTE: no `locationId` field — this MVP doesn't have a Location model
 * (single-location Starter tier only; see project-overview.md §17/§21
 * "future possibilities: multi-location"). Revisit when Location ships.
 */
export interface BookingAttrs {
  companyId: Types.ObjectId;
  employeeId: Types.ObjectId;
  customerId: Types.ObjectId;
  serviceId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  footprintEndAt: Date;
  status: BookingStatus;
  customerNote?: string;
  internalNote?: string;
  cancellationReason?: string;
  /** Which tenant user created this (staff-created booking). */
  createdByUserId?: Types.ObjectId;
  /**
   * Set when the corresponding reminder Notification actually reaches
   * `sent` status — not when it's merely scheduled. See
   * notificationService.ts / reminderScheduler.ts. technical-spec.md §3.
   */
  reminder24hSentAt?: Date;
  reminder2hSentAt?: Date;
}

export type BookingDocument = HydratedDocument<BookingAttrs>;

const bookingSchema = new Schema<BookingAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    startAt: { type: Date, required: true },
    endAt: {
      type: Date,
      required: true,
      validate: {
        validator: function endAfterStart(this: BookingAttrs, value: Date) {
          return value > this.startAt;
        },
        message: 'endAt must be after startAt',
      },
    },
    footprintEndAt: {
      type: Date,
      required: true,
      validate: {
        validator: function footprintNotBeforeEnd(this: BookingAttrs, value: Date) {
          return value >= this.endAt;
        },
        message: 'footprintEndAt must not be before endAt',
      },
    },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: 'pending' },
    customerNote: { type: String, trim: true, maxlength: 2000 },
    internalNote: { type: String, trim: true, maxlength: 2000 },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
    reminder24hSentAt: { type: Date },
    reminder2hSentAt: { type: Date },
  },
  { timestamps: true },
);

bookingSchema.index({ companyId: 1, employeeId: 1, startAt: 1 });
bookingSchema.index({ companyId: 1, customerId: 1 });
bookingSchema.index({ companyId: 1, status: 1 });

export const BookingModel: Model<BookingAttrs> = model<BookingAttrs>('Booking', bookingSchema);
