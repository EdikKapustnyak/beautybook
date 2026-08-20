import { describe, expect, it } from 'vitest';

import { createBlockedTimeSchema } from '../blockedTimeSchemas.js';

const future = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);

describe('createBlockedTimeSchema', () => {
  it('accepts a valid company-wide blocked interval', () => {
    const result = createBlockedTimeSchema.safeParse({
      startAt: future(24).toISOString(),
      endAt: future(48).toISOString(),
      reason: 'Public holiday',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid employee-specific blocked interval', () => {
    const result = createBlockedTimeSchema.safeParse({
      employeeId: '507f1f77bcf86cd799439011',
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid employeeId', () => {
    const result = createBlockedTimeSchema.safeParse({
      employeeId: 'not-a-valid-id',
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects endAt before startAt', () => {
    const result = createBlockedTimeSchema.safeParse({
      startAt: future(48).toISOString(),
      endAt: future(24).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects endAt equal to startAt', () => {
    const instant = future(24).toISOString();
    const result = createBlockedTimeSchema.safeParse({ startAt: instant, endAt: instant });
    expect(result.success).toBe(false);
  });

  it('rejects a blocked interval entirely in the past', () => {
    const result = createBlockedTimeSchema.safeParse({
      startAt: future(-48).toISOString(),
      endAt: future(-24).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects HTML in the reason', () => {
    const result = createBlockedTimeSchema.safeParse({
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString(),
      reason: '<script>alert(1)</script>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mass-assignment attempts (companyId)', () => {
    const result = createBlockedTimeSchema.safeParse({
      companyId: 'someone-elses-company',
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
