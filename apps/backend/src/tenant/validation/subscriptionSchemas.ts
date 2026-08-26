// apps/backend/src/tenant/validation/subscriptionSchemas.ts

import { z } from 'zod';

export const createCheckoutSessionSchema = z
  .object({
    plan: z.enum(['starter', 'business']),
  })
  .strict();
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
