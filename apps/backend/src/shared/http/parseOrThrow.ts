import type { ZodType, ZodTypeDef } from 'zod';

import { ValidationError } from '../errors/AppError.js';

/**
 * Accepts schemas whose parsed input type differs from their output type
 * (e.g. `z.coerce.number().default(1)` — input is `number | undefined`,
 * output is `number`), which a plain `ZodSchema<T>` alias would reject.
 */
export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join('.') || 'value'}: ${firstIssue.message}`
      : 'The request was invalid.';
    throw new ValidationError(message);
  }
  return result.data;
}
