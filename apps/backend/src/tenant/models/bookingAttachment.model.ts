import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const BOOKING_ATTACHMENT_STATUSES = ['active', 'deleted'] as const;
export type BookingAttachmentStatus = (typeof BOOKING_ATTACHMENT_STATUSES)[number];

/**
 * `companyId` is a practical addition beyond technical-spec.md §3's exact
 * field list — it's what lets the tenant-scoped repository/authorization
 * check happen without an extra join to Booking on every read. Never
 * exposed in a public response (there is no public endpoint for these at
 * all — see security-measures.md §11).
 */
export interface BookingAttachmentAttrs {
  companyId: Types.ObjectId;
  bookingId: Types.ObjectId;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: Date;
  status: BookingAttachmentStatus;
}

export type BookingAttachmentDocument = HydratedDocument<BookingAttachmentAttrs>;

const bookingAttachmentSchema = new Schema<BookingAttachmentAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: BOOKING_ATTACHMENT_STATUSES,
      required: true,
      default: 'active',
    },
  },
  { timestamps: true },
);

bookingAttachmentSchema.index({ companyId: 1, bookingId: 1 });
bookingAttachmentSchema.index({ storageKey: 1 }, { unique: true });
// Drives the cleanup job — see bookingAttachmentRepository.findExpired.
bookingAttachmentSchema.index({ status: 1, expiresAt: 1 });

export const BookingAttachmentModel: Model<BookingAttachmentAttrs> = model<BookingAttachmentAttrs>(
  'BookingAttachment',
  bookingAttachmentSchema,
);
