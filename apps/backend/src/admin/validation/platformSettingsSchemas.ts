// apps/backend/src/admin/validation/platformSettingsSchemas.ts

import { z } from 'zod';

export const updatePlatformSettingsSchema = z
  .object({
    platformName: z.string().trim().min(1).max(100).optional(),
    supportEmail: z.string().trim().email().optional(),
    defaultCurrency: z
      .string()
      .trim()
      .length(3)
      .transform((c) => c.toUpperCase())
      .optional(),
    trialLengthDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
