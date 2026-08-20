import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  getWeeklyScheduleError,
  WEEKDAYS,
  type WeeklySchedule,
} from '../../shared/validation/workingHours.js';

/**
 * Employee is the business-facing staff/roster entity used by the
 * calendar and booking engine (technical-spec.md §3). It is intentionally
 * DISTINCT from TenantUser (the login/auth account):
 *  - Not every staff member needs system access (e.g. a contractor whose
 *    schedule the owner manages on their behalf).
 *  - Not every TenantUser is a bookable staff member (e.g. an `admin`
 *    role might be back-office only).
 * `userId` links the two when a staff member DOES have a login, and is
 * left unset otherwise.
 *
 * `workingHours` (dev-tasks.md §8) is a per-employee weekly template of
 * working periods + breaks, in company-local wall-clock time ("HH:mm").
 * Validated with the shared `getWeeklyScheduleError` — see
 * shared/validation/workingHours.ts for the exact rules (no overlapping
 * periods/breaks, breaks must fall within their period, no
 * midnight-crossing periods). Updating it is always a FULL REPLACE of the
 * whole week, never a per-day patch — see tenant/validation/employeeSchemas.ts.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9()\-.\s]{6,32}$/;

export interface EmployeeAttrs {
  companyId: Types.ObjectId;
  /** Optional link to a TenantUser login account — see note above. */
  userId?: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  serviceIds: Types.ObjectId[];
  workingHours: WeeklySchedule;
  active: boolean;
}

export type EmployeeDocument = HydratedDocument<EmployeeAttrs>;

const timeRangeSchema = new Schema(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false },
);

const workingPeriodSchema = new Schema(
  {
    start: { type: String, required: true },
    end: { type: String, required: true },
    breaks: { type: [timeRangeSchema], default: undefined },
  },
  { _id: false },
);

const weeklyScheduleSchemaDefinition = Object.fromEntries(
  WEEKDAYS.map((day) => [day, { type: [workingPeriodSchema], default: undefined }]),
);

const employeeSchema = new Schema<EmployeeAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
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
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
      validate: {
        validator: (value: string) => !value || PHONE_PATTERN.test(value),
        message: 'phone must be a valid phone number',
      },
    },
    serviceIds: { type: [Schema.Types.ObjectId], ref: 'Service', default: [] },
    workingHours: {
      type: new Schema(weeklyScheduleSchemaDefinition, { _id: false }),
      default: () => ({}),
      validate: {
        validator: (value: WeeklySchedule) => getWeeklyScheduleError(value ?? {}) === null,
        message: (props: { value: WeeklySchedule }) =>
          getWeeklyScheduleError(props.value ?? {}) ?? 'workingHours is invalid.',
      },
    },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

employeeSchema.index({ companyId: 1 });
employeeSchema.index({ companyId: 1, active: 1 });

export const EmployeeModel: Model<EmployeeAttrs> = model<EmployeeAttrs>('Employee', employeeSchema);
