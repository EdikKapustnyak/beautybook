import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * Company IS the tenant boundary — every other tenant-scoped collection
 * carries a `companyId` referencing this collection's `_id`. See
 * beautybook-technical-spec.md §2/§3 and beautybook-project-overview.md §17.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type CompanyStatus = 'draft' | 'active' | 'suspended';

/**
 * Small, fixed set of pre-built templates — project-overview.md §4: "Для
 * MVP не нужен полноценный Wix. Достаточно нескольких заранее
 * разработанных красивых шаблонов." Never free-form theme/CSS input.
 */
export const COMPANY_THEMES = ['classic', 'modern', 'minimal'] as const;
export type CompanyTheme = (typeof COMPANY_THEMES)[number];

/**
 * Fixed allowlist of named platforms, not free-form key/value pairs —
 * same MVP-scope reasoning as COMPANY_THEMES above, and keeps validation
 * simple (each key gets the same safe-URL check, security-measures.md
 * §8). `website` covers any link that isn't one of the specific socials.
 */
export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

export interface BookingSettings {
  allowOnlineCancel: boolean;
  allowOnlineReschedule: boolean;
  minNoticeMinutes: number;
  maxAdvanceBookingDays: number;
}

export interface CompanyAttrs {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  coverImage?: string;
  timezone: string;
  currency: string;
  bookingSettings: BookingSettings;
  theme: CompanyTheme;
  socialLinks: SocialLinks;
  subscriptionId?: string;
  status: CompanyStatus;
}

export type CompanyDocument = HydratedDocument<CompanyAttrs>;

const bookingSettingsSchema = new Schema<BookingSettings>(
  {
    allowOnlineCancel: { type: Boolean, default: true },
    allowOnlineReschedule: { type: Boolean, default: true },
    minNoticeMinutes: { type: Number, default: 60, min: 0, max: 60 * 24 * 30 },
    maxAdvanceBookingDays: { type: Number, default: 60, min: 1, max: 365 },
  },
  { _id: false },
);

const socialLinksSchema = new Schema<SocialLinks>(
  {
    instagram: { type: String, trim: true, maxlength: 2048 },
    facebook: { type: String, trim: true, maxlength: 2048 },
    tiktok: { type: String, trim: true, maxlength: 2048 },
    website: { type: String, trim: true, maxlength: 2048 },
  },
  { _id: false },
);

const companySchema = new Schema<CompanyAttrs>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 63,
      validate: {
        validator: (value: string) => SLUG_PATTERN.test(value),
        message: 'slug must be lowercase alphanumeric segments separated by single hyphens',
      },
    },
    description: { type: String, trim: true, maxlength: 2000 },
    logo: { type: String, trim: true, maxlength: 2048 },
    coverImage: { type: String, trim: true, maxlength: 2048 },
    timezone: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => {
          try {
            // Throws RangeError for an unknown/invalid IANA timezone.
            Intl.DateTimeFormat(undefined, { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        message: 'timezone must be a valid IANA timezone identifier (e.g. Europe/Oslo)',
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
    bookingSettings: { type: bookingSettingsSchema, default: () => ({}) },
    theme: {
      type: String,
      enum: COMPANY_THEMES,
      default: 'classic',
      required: true,
    },
    socialLinks: { type: socialLinksSchema, default: () => ({}) },
    subscriptionId: { type: String, trim: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'suspended'] satisfies CompanyStatus[],
      default: 'draft',
      required: true,
    },
  },
  { timestamps: true },
);

export const CompanyModel: Model<CompanyAttrs> = model<CompanyAttrs>('Company', companySchema);
