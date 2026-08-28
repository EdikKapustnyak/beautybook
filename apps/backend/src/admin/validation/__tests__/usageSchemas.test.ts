import { describe, expect, it } from 'vitest';

import { usageQuerySchema } from '../usageSchemas.js';

describe('usageQuerySchema', () => {
  it('defaults to 30 days when omitted', () => {
    const result = usageQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(30);
    }
  });

  it('coerces a string query param to a number', () => {
    const result = usageQuerySchema.safeParse({ days: '7' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.days).toBe(7);
    }
  });

  it('rejects a value above 90', () => {
    expect(usageQuerySchema.safeParse({ days: '200' }).success).toBe(false);
  });

  it('rejects a value below 1', () => {
    expect(usageQuerySchema.safeParse({ days: '0' }).success).toBe(false);
  });
});
