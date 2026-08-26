// apps/backend/src/admin/validation/adminSubscriptionSchemas.ts

import { z } from 'zod';

export const grantSubscriptionSchema = z
  .object({
    plan: z.enum(['starter', 'business']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
