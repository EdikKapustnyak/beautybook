// apps/backend/src/admin/validation/usageSchemas.ts

import { z } from 'zod';

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
