import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * A blocked interval — either company-wide (e.g. a public holiday, the
 * whole business closed) when `employeeId` is unset, or specific to one
 * employee (e.g. their day off, a dentist appointment) when it is set.
 *
 * A "blocked day" is not a distinct concept from a "blocked interval" —
 * it's just an interval spanning the full day (00:00-24:00 in the
 * company's timezone). No separate `type` field is needed, matching
 * technical-spec.md §3's BlockedTime shape exactly.
 */
export interface BlockedTimeAttrs {
  companyId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  reason?: string;
}

export type BlockedTimeDocument = HydratedDocument<BlockedTimeAttrs>;

const blockedTimeSchema = new Schema<BlockedTimeAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    startAt: { type: Date, required: true },
    endAt: {
      type: Date,
      required: true,
      validate: {
        validator: function endAfterStart(this: BlockedTimeAttrs, value: Date) {
          return value > this.startAt;
        },
        message: 'endAt must be after startAt',
      },
    },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

blockedTimeSchema.index({ companyId: 1, employeeId: 1, startAt: 1 });
blockedTimeSchema.index({ companyId: 1, startAt: 1 });

export const BlockedTimeModel: Model<BlockedTimeAttrs> = model<BlockedTimeAttrs>(
  'BlockedTime',
  blockedTimeSchema,
);
