import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');

export const reorderPortfolioSchema = z
  .object({
    orderedImageIds: z.array(objectIdSchema).min(1).max(500),
  })
  .strict();
export type ReorderPortfolioInput = z.infer<typeof reorderPortfolioSchema>;
