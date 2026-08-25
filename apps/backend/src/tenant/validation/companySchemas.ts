import { z } from 'zod';

import { isPlainText } from '../../shared/validation/plainText.js';
import { isSafeUrl } from '../../shared/validation/safeUrl.js';
import { isValidIanaTimezone } from '../../shared/validation/timezone.js';

const plainTextSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .refine(isPlainText, 'Must not contain HTML tags or angle brackets.');

const safeUrlSchema = z.string().trim().max(2048).refine(isSafeUrl, 'Must be a valid http(s) URL.');

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidIanaTimezone, 'Must be a valid IANA timezone identifier (e.g. Europe/Oslo).');

const currencySchema = z
  .string()
  .trim()
  .length(3, 'Must be a 3-letter ISO 4217 code (e.g. NOK).')
  .transform((value) => value.toUpperCase());

const bookingSettingsSchema = z
  .object({
    allowOnlineCancel: z.boolean(),
    allowOnlineReschedule: z.boolean(),
    minNoticeMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 30),
    maxAdvanceBookingDays: z.number().int().min(1).max(365),
  })
  .partial();

// Fixed enum, not free-form theme/CSS input — see company.model.ts's
// COMPANY_THEMES comment (project-overview.md §4: a small set of
// pre-built templates, not a full page builder).
const themeSchema = z.enum(['classic', 'modern', 'minimal']);

// Fixed allowlist of named platforms (not free-form key/value pairs),
// each safe-URL validated — security-measures.md §8/§9 (URL scheme
// allowlist; javascript:/data:/vbscript: rejected via isSafeUrl).
const socialLinksSchema = z
  .object({
    instagram: safeUrlSchema,
    facebook: safeUrlSchema,
    tiktok: safeUrlSchema,
    website: safeUrlSchema,
  })
  .partial()
  .strict();

// .strict() is the key defense here: any field NOT listed below (slug,
// status, subscriptionId, _id, companyId, ...) is rejected outright rather
// than silently ignored. Combined with the explicit field allowlist the
// controller forwards to the service, this is defense in depth against
// mass-assignment / privilege escalation via extra body fields. See
// beautybook-security-measures.md §6.
export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: plainTextSchema(2000).optional(),
    logo: safeUrlSchema.optional(),
    coverImage: safeUrlSchema.optional(),
    timezone: timezoneSchema.optional(),
    currency: currencySchema.optional(),
    bookingSettings: bookingSettingsSchema.optional(),
    theme: themeSchema.optional(),
    socialLinks: socialLinksSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
