import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';
import { isPlainText } from '../../shared/validation/plainText.js';

const MAX_SEARCH_LENGTH = 100;

const tagSchema = z.string().trim().min(1).max(40);
const notesSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(isPlainText, 'Must not contain HTML tags or angle brackets.');
const prioritySchema = z.number().int().min(0).max(100);

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(6).max(32),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    tags: z.array(tagSchema).max(20).optional(),
    notes: notesSchema.optional(),
    priority: prioritySchema.optional(),
  })
  .strict();
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  // Bounded length is defense in depth — the actual regex-injection/ReDoS
  // protection is escapeRegExp() in customerRepository.ts. A short cap
  // here just keeps obviously-abusive input from reaching that far.
  search: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  tag: tagSchema.optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
