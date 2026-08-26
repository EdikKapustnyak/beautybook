import { describe, expect, it } from 'vitest';

import { createCheckoutSessionSchema } from '../subscriptionSchemas.js';

describe('createCheckoutSessionSchema', () => {
  it('accepts a valid plan', () => {
    expect(createCheckoutSessionSchema.safeParse({ plan: 'starter' }).success).toBe(true);
    expect(createCheckoutSessionSchema.safeParse({ plan: 'business' }).success).toBe(true);
  });

  it('rejects a plan outside the fixed enum', () => {
    const result = createCheckoutSessionSchema.safeParse({ plan: 'enterprise' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing plan', () => {
    const result = createCheckoutSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = createCheckoutSessionSchema.safeParse({
      plan: 'starter',
      priceId: 'price_hack',
    });
    expect(result.success).toBe(false);
  });
});
