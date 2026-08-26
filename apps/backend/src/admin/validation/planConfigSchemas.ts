// apps/backend/src/admin/validation/planConfigSchemas.ts

import { z } from 'zod';

export const planParamSchema = z.object({
  plan: z.enum(['starter', 'business']),
});

export const updatePlanConfigSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    priceAmount: z.number().int().min(0).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((c) => c.toUpperCase())
      .optional(),
    discountPercent: z.number().int().min(0).max(100).optional(),
    stripePriceId: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
