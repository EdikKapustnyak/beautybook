import { describe, expect, it } from 'vitest';

import { DiscountCodeModel } from '../discountCode.model.js';

function buildValidCode(overrides: Record<string, unknown> = {}) {
  return new DiscountCodeModel({
    code: 'summer15',
    percentOff: 15,
    stripeCouponId: 'coupon_test',
    stripePromotionCodeId: 'promo_test',
    ...overrides,
  });
}

describe('DiscountCodeModel validation', () => {
  it('accepts a well-formed code and uppercases it', () => {
    const doc = buildValidCode();
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.code).toBe('SUMMER15');
  });

  it('defaults active to true and appliesToPlans to empty (all plans)', () => {
    const doc = buildValidCode();
    expect(doc.active).toBe(true);
    expect(doc.appliesToPlans).toEqual([]);
  });

  it('rejects percentOff above 100', () => {
    const doc = buildValidCode({ percentOff: 150 });
    expect(doc.validateSync()?.errors.percentOff).toBeDefined();
  });

  it('rejects percentOff of 0', () => {
    const doc = buildValidCode({ percentOff: 0 });
    expect(doc.validateSync()?.errors.percentOff).toBeDefined();
  });

  it('rejects a missing stripeCouponId', () => {
    const doc = buildValidCode({ stripeCouponId: undefined });
    expect(doc.validateSync()?.errors.stripeCouponId).toBeDefined();
  });

  it('rejects a missing stripePromotionCodeId', () => {
    const doc = buildValidCode({ stripePromotionCodeId: undefined });
    expect(doc.validateSync()?.errors.stripePromotionCodeId).toBeDefined();
  });

  it('rejects an appliesToPlans value outside the fixed plan enum', () => {
    const doc = buildValidCode({ appliesToPlans: ['enterprise'] });
    expect(doc.validateSync()?.errors['appliesToPlans.0']).toBeDefined();
  });

  it('accepts an explicit appliesToPlans subset', () => {
    const doc = buildValidCode({ appliesToPlans: ['business'] });
    expect(doc.validateSync()).toBeUndefined();
  });
});
