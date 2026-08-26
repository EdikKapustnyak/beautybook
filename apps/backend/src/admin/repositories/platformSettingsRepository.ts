// apps/backend/src/admin/repositories/platformSettingsRepository.ts

import {
  PlatformSettingsModel,
  type PlatformSettingsAttrs,
  type PlatformSettingsDocument,
} from '../models/platformSettings.model.js';

// No natural unique key for a singleton — an empty filter matches
// "the one document" as long as exactly one is ever created, which
// getOrCreateDefaults below guarantees (find-then-create, never a bare
// unconditional create).
const SINGLETON_FILTER = {};

const DEFAULTS: PlatformSettingsAttrs = {
  platformName: 'BeautyBook',
  supportEmail: 'support@beautybook.no',
  defaultCurrency: 'NOK',
  trialLengthDays: 14,
};

export const platformSettingsRepository = {
  async getOrCreateDefaults(): Promise<PlatformSettingsDocument> {
    const existing = await PlatformSettingsModel.findOne(SINGLETON_FILTER).exec();
    if (existing) return existing;
    return PlatformSettingsModel.create(DEFAULTS);
  },

  async update(updates: Partial<PlatformSettingsAttrs>): Promise<PlatformSettingsDocument> {
    await this.getOrCreateDefaults(); // ensure a row exists before updating
    const updated = await PlatformSettingsModel.findOneAndUpdate(
      SINGLETON_FILTER,
      { $set: updates },
      { new: true },
    ).exec();
    if (!updated) {
      // Unreachable in practice — getOrCreateDefaults() just guaranteed
      // a row exists immediately above — but throwing here instead of a
      // non-null assertion keeps this file honest about that being an
      // invariant, not a certainty the type system can see.
      throw new Error('Platform settings row disappeared between create and update.');
    }
    return updated;
  },
};
