import { describe, expect, it } from 'vitest';

import { createDiscountCodeSchema, setDiscountCodeActiveSchema } from '../discountCodeSchemas.js';

describe('createDiscountCodeSchema', () => {
  it('accepts a valid code and uppercases it', () => {
    const result = createDiscountCodeSchema.safeParse({ code: 'summer15', percentOff: 15 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('SUMMER15');
    }
  });

  it('rejects a code with invalid characters', () => {
    const result = createDiscountCodeSchema.safeParse({ code: 'summer 15!', percentOff: 15 });
    expect(result.success).toBe(false);
  });

  it('rejects percentOff above 100', () => {
    const result = createDiscountCodeSchema.safeParse({ code: 'X', percentOff: 150 });
    expect(result.success).toBe(false);
  });

  it('accepts optional appliesToPlans/maxRedemptions/expiresAt', () => {
    const result = createDiscountCodeSchema.safeParse({
      code: 'BIZ20',
      percentOff: 20,
      appliesToPlans: ['business'],
      maxRedemptions: 50,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown plan in appliesToPlans', () => {
    const result = createDiscountCodeSchema.safeParse({
      code: 'X',
      percentOff: 10,
      appliesToPlans: ['enterprise'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = createDiscountCodeSchema.safeParse({
      code: 'X',
      percentOff: 10,
      stripeCouponId: 'hacked',
    });
    expect(result.success).toBe(false);
  });
});

describe('setDiscountCodeActiveSchema', () => {
  it('accepts a boolean active field', () => {
    expect(setDiscountCodeActiveSchema.safeParse({ active: false }).success).toBe(true);
  });

  it('rejects a missing active field', () => {
    expect(setDiscountCodeActiveSchema.safeParse({}).success).toBe(false);
  });
});
