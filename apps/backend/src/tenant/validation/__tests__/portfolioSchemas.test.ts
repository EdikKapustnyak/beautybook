import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { reorderPortfolioSchema } from '../portfolioSchemas.js';

describe('reorderPortfolioSchema', () => {
  it('accepts a valid list of ids', () => {
    const result = reorderPortfolioSchema.safeParse({
      orderedImageIds: [String(new Types.ObjectId()), String(new Types.ObjectId())],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty list', () => {
    const result = reorderPortfolioSchema.safeParse({ orderedImageIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid id in the list', () => {
    const result = reorderPortfolioSchema.safeParse({ orderedImageIds: ['not-a-valid-id'] });
    expect(result.success).toBe(false);
  });

  it('rejects mass-assignment attempts', () => {
    const result = reorderPortfolioSchema.safeParse({
      orderedImageIds: [String(new Types.ObjectId())],
      companyId: 'someone-elses-company',
    });
    expect(result.success).toBe(false);
  });
});
