import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * `priority` (0-100) doubles as the "VIP-ness" signal project-overview.md
 * §10 describes (VIP notification priority, waitlist ordering, internal
 * CRM sort) — there's deliberately no separate `tier`/`level` enum field.
 * project-overview.md §9's "New/Regular/VIP" levels are informal labels a
 * business can express via `tags` (free-form) instead; a fixed enum would
 * be less flexible than what §9 itself asks for ("при необходимости
 * другие внутренние статусы").
 */
const PHONE_PATTERN = /^\+?[0-9()\-.\s]{6,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PRIORITY = 100;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

export interface CustomerAttrs {
  companyId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  notes?: string;
  priority: number;
  /** Denormalized — incremented by bookingService on each successful booking. See customerRepository.recordBooking. */
  totalBookings: number;
  lastBookingAt?: Date;
}

export type CustomerDocument = HydratedDocument<CustomerAttrs>;

const customerSchema = new Schema<CustomerAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => PHONE_PATTERN.test(value),
        message: 'phone must be a valid phone number',
      },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: (value: string) => !value || EMAIL_PATTERN.test(value),
        message: 'email must be a valid email address',
      },
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (value: string[]) =>
          value.length <= MAX_TAGS && value.every((tag) => tag.length <= MAX_TAG_LENGTH),
        message: `tags must have at most ${MAX_TAGS} entries of at most ${MAX_TAG_LENGTH} characters each`,
      },
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    priority: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'priority must not be negative'],
      max: [MAX_PRIORITY, `priority must be at most ${MAX_PRIORITY}`],
      validate: { validator: Number.isInteger, message: 'priority must be a whole number' },
    },
    totalBookings: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'totalBookings must not be negative'],
    },
    lastBookingAt: { type: Date },
  },
  { timestamps: true },
);

// One customer record per phone number per company — repeat bookings by
// the same phone number should find the same customer, not create a
// duplicate every time. See technical-spec.md §4 index candidates.
customerSchema.index({ companyId: 1, phone: 1 }, { unique: true });
customerSchema.index({ companyId: 1, name: 1 });
customerSchema.index({ companyId: 1, priority: -1 });

export const CustomerModel: Model<CustomerAttrs> = model<CustomerAttrs>('Customer', customerSchema);
