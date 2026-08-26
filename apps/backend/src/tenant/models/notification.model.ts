import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'booking_confirmation',
  'owner_notification',
  'reminder_24h',
  'reminder_2h',
  'cancellation',
  'reschedule',
  'otp',
  'subscription_payment_failed',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['pending', 'sending', 'sent', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * `dedupeKey` is what makes retried/duplicate BullMQ jobs and duplicate
 * provider callbacks safe (dev-tasks.md §16 "duplicate job",
 * "duplicate provider callback"): callers construct it deterministically
 * (e.g. `${bookingId}:reminder_24h`), and the unique index means a second
 * attempt to create the same notification is rejected at the DB level —
 * the caller then just looks up and reuses the existing record instead of
 * creating a second one. See notificationService.ts.
 */
export interface NotificationAttrs {
  companyId: Types.ObjectId;
  bookingId?: Types.ObjectId;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  body: string;
  dedupeKey: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  providerMessageId?: string;
  scheduledAt: Date;
  sentAt?: Date;
  failureReason?: string;
}

export type NotificationDocument = HydratedDocument<NotificationAttrs>;

const notificationSchema = new Schema<NotificationAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true, default: 'sms' },
    recipient: { type: String, required: true, trim: true },
    body: { type: String, required: true, maxlength: 1600 }, // ~10 SMS segments
    dedupeKey: { type: String, required: true },
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true, default: 'pending' },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 3, min: 1 },
    providerMessageId: { type: String },
    scheduledAt: { type: Date, required: true },
    sentAt: { type: Date },
    failureReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

notificationSchema.index({ dedupeKey: 1 }, { unique: true });
notificationSchema.index({ companyId: 1, bookingId: 1 });
notificationSchema.index({ status: 1, scheduledAt: 1 });

export const NotificationModel: Model<NotificationAttrs> = model<NotificationAttrs>(
  'Notification',
  notificationSchema,
);
