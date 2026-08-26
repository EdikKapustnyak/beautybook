// apps/backend/src/admin/validation/discountCodeSchemas.ts

import { z } from 'zod';

const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export const createDiscountCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((c) => c.toUpperCase())
      .refine((c) => CODE_PATTERN.test(c), 'Code must be 3-32 uppercase letters, digits, - or _.'),
    percentOff: z.number().int().min(1).max(100),
    appliesToPlans: z.array(z.enum(['starter', 'business'])).optional(),
    maxRedemptions: z.number().int().min(1).optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();

export const codeParamSchema = z.object({
  code: z.string().trim().min(1).max(32),
});

export const setDiscountCodeActiveSchema = z
  .object({
    active: z.boolean(),
  })
  .strict();
