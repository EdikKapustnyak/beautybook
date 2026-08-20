import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

// Bounds chosen to keep the model sane, not as exact business rules —
// revisit if a real salon workflow needs longer/shorter services.
const MAX_DURATION_MINUTES = 8 * 60; // one working day
const MAX_BUFFER_MINUTES = 4 * 60;

export interface ServiceAttrs {
  companyId: Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  currency: string;
  durationMinutes: number;
  bufferMinutes: number;
  employeeIds: Types.ObjectId[];
  active: boolean;
}

export type ServiceDocument = HydratedDocument<ServiceAttrs>;

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return Math.round(value * 100) === value * 100;
}

const serviceSchema = new Schema<ServiceAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    price: {
      type: Number,
      required: true,
      min: [0.01, 'price must be greater than zero'],
      validate: {
        validator: hasAtMostTwoDecimalPlaces,
        message: 'price must have at most 2 decimal places',
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      validate: {
        validator: (value: string) => CURRENCY_PATTERN.test(value),
        message: 'currency must be a 3-letter ISO 4217 code (e.g. NOK)',
      },
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: [1, 'durationMinutes must be at least 1'],
      max: [MAX_DURATION_MINUTES, `durationMinutes must be at most ${MAX_DURATION_MINUTES}`],
      validate: {
        validator: Number.isInteger,
        message: 'durationMinutes must be a whole number',
      },
    },
    bufferMinutes: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'bufferMinutes must not be negative'],
      max: [MAX_BUFFER_MINUTES, `bufferMinutes must be at most ${MAX_BUFFER_MINUTES}`],
      validate: {
        validator: Number.isInteger,
        message: 'bufferMinutes must be a whole number',
      },
    },
    employeeIds: { type: [Schema.Types.ObjectId], ref: 'Employee', default: [] },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

serviceSchema.index({ companyId: 1 });
serviceSchema.index({ companyId: 1, active: 1 });

export const ServiceModel: Model<ServiceAttrs> = model<ServiceAttrs>('Service', serviceSchema);
