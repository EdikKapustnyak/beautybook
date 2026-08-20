import type { Types } from 'mongoose';

import { SlotLockModel } from '../models/slotLock.model.js';

interface MongoDuplicateKeyError {
  code?: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as MongoDuplicateKeyError).code === 11000
  );
}

export const slotLockRepository = {
  /**
   * Attempts to insert one SlotLock document per cell key. The UNIQUE
   * INDEX on (employeeId, cellKey) is the actual atomicity guarantee: if
   * two concurrent calls both try to lock the same cell, MongoDB itself
   * lets only one succeed — this function's job is just to react
   * correctly to that outcome, not to implement the guarantee itself.
   *
   * `ordered: true` means insertMany stops at the first failure, so on a
   * duplicate-key error some of THIS call's own documents may already be
   * inserted; those are cleaned up before returning false so a failed
   * reservation never leaves partial locks behind.
   */
  async reserve(
    employeeId: string | Types.ObjectId,
    cellKeys: string[],
    bookingId: string | Types.ObjectId,
  ): Promise<boolean> {
    try {
      await SlotLockModel.insertMany(
        cellKeys.map((cellKey) => ({ employeeId, cellKey, bookingId })),
        { ordered: true },
      );
      return true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      await SlotLockModel.deleteMany({ bookingId }).exec();
      return false;
    }
  },

  async release(bookingId: string | Types.ObjectId): Promise<void> {
    await SlotLockModel.deleteMany({ bookingId }).exec();
  },

  async releaseCells(bookingId: string | Types.ObjectId, cellKeys: string[]): Promise<void> {
    if (cellKeys.length === 0) {
      return;
    }
    await SlotLockModel.deleteMany({ bookingId, cellKey: { $in: cellKeys } }).exec();
  },
};
