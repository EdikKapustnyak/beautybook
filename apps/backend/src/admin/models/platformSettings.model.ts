// apps/backend/src/admin/models/platformSettings.model.ts
//
// Single-document collection (a "singleton" — always exactly one row,
// found/created via SINGLETON_FILTER below rather than an _id lookup, so
// callers never need to know or store an id). Platform-wide, admin-only
// configuration — nothing on the tenant side reads this yet (no
// eslint-boundary concern, unlike Subscription/PlanConfig).

import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface PlatformSettingsAttrs {
  platformName: string;
  supportEmail: string;
  defaultCurrency: string;
  trialLengthDays: number;
}

export type PlatformSettingsDocument = HydratedDocument<PlatformSettingsAttrs>;

const platformSettingsSchema = new Schema<PlatformSettingsAttrs>(
  {
    platformName: { type: String, required: true, trim: true, maxlength: 100 },
    supportEmail: { type: String, required: true, trim: true, lowercase: true },
    defaultCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    trialLengthDays: { type: Number, required: true, min: 0, max: 365 },
  },
  { timestamps: true },
);

export const PlatformSettingsModel: Model<PlatformSettingsAttrs> = model<PlatformSettingsAttrs>(
  'PlatformSettings',
  platformSettingsSchema,
);
