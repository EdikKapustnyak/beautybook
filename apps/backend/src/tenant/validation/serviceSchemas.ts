import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { isPlainText } from '../../shared/validation/plainText.js';
import { paginationQuerySchema } from '../../shared/validation/pagination.js';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');

const priceSchema = z
  .number()
  .positive('price must be greater than zero')
  .max(1_000_000)
  .refine(
    (value) => Math.round(value * 100) === value * 100,
    'price must have at most 2 decimal places',
  );

const currencySchema = z
  .string()
  .trim()
  .length(3, 'Must be a 3-letter ISO 4217 code (e.g. NOK).')
  .transform((value) => value.toUpperCase());

export const createServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z
      .string()
      .trim()
      .max(2000)
      .refine(isPlainText, 'Must not contain HTML tags or angle brackets.')
      .optional(),
    price: priceSchema,
    currency: currencySchema,
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(8 * 60),
    bufferMinutes: z
      .number()
      .int()
      .min(0)
      .max(4 * 60)
      .optional(),
    employeeIds: z.array(objectIdSchema).max(500).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = paginationQuerySchema.extend({
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
