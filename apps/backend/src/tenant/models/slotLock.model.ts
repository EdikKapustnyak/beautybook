import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * How double-booking is actually prevented (security-measures.md §16,
 * technical-spec.md §9): "unique slot/resource key" — one of the
 * explicitly sanctioned alternatives to a multi-document transaction
 * (which would require a replica-set MongoDB deployment; this works on a
 * single standalone instance too).
 *
 * A booking's time footprint [startAt, footprintEndAt) is broken into
 * fixed-width "cells" (see tenant/services/slotLocking.ts,
 * `computeSlotCellKeys`). Reserving a booking = inserting one SlotLock
 * document per cell it touches, for that employee. The UNIQUE INDEX on
 * (employeeId, cellKey) is what makes this atomic: if two concurrent
 * requests both try to insert a lock for the same cell, MongoDB itself
 * guarantees only one insert succeeds — that's the actual correctness
 * guarantee, not application-level logic. Cancelling/no-showing a booking
 * deletes its lock rows, freeing the cells back up.
 */
export interface SlotLockAttrs {
  employeeId: Types.ObjectId;
  cellKey: string;
  bookingId: Types.ObjectId;
}

export type SlotLockDocument = HydratedDocument<SlotLockAttrs>;

const slotLockSchema = new Schema<SlotLockAttrs>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    cellKey: { type: String, required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  },
  { timestamps: true },
);

slotLockSchema.index({ employeeId: 1, cellKey: 1 }, { unique: true });
slotLockSchema.index({ bookingId: 1 });

export const SlotLockModel: Model<SlotLockAttrs> = model<SlotLockAttrs>('SlotLock', slotLockSchema);
