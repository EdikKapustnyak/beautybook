import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { isPlainText } from '../../shared/validation/plainText.js';
import { paginationQuerySchema } from '../../shared/validation/pagination.js';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');
const isoDateSchema = z.coerce.date();

export const createBlockedTimeSchema = z
  .object({
    employeeId: objectIdSchema.optional(),
    startAt: isoDateSchema,
    endAt: isoDateSchema,
    reason: z
      .string()
      .trim()
      .max(500)
      .refine(isPlainText, 'Must not contain HTML tags or angle brackets.')
      .optional(),
  })
  .strict()
  .refine((data) => data.endAt > data.startAt, {
    message: 'endAt must be after startAt.',
    path: ['endAt'],
  })
  .refine((data) => data.endAt > new Date(), {
    // dev-tasks.md §8 "past dates" check — creating a block that has
    // already fully elapsed has no effect and is almost always a mistake.
    message: 'Cannot create a blocked interval that has already passed.',
    path: ['endAt'],
  });
export type CreateBlockedTimeInput = z.infer<typeof createBlockedTimeSchema>;

export const listBlockedTimeQuerySchema = paginationQuerySchema.extend({
  employeeId: objectIdSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type ListBlockedTimeQuery = z.infer<typeof listBlockedTimeQuerySchema>;
