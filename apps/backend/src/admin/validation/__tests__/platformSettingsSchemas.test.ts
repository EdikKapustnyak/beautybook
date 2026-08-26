import { describe, expect, it } from 'vitest';

import { updatePlatformSettingsSchema } from '../platformSettingsSchemas.js';

describe('updatePlatformSettingsSchema', () => {
  it('accepts a partial update', () => {
    expect(updatePlatformSettingsSchema.safeParse({ platformName: 'New Name' }).success).toBe(true);
  });

  it('uppercases defaultCurrency', () => {
    const result = updatePlatformSettingsSchema.safeParse({ defaultCurrency: 'usd' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultCurrency).toBe('USD');
    }
  });

  it('rejects an invalid supportEmail', () => {
    expect(updatePlatformSettingsSchema.safeParse({ supportEmail: 'not-an-email' }).success).toBe(
      false,
    );
  });

  it('rejects trialLengthDays above 365', () => {
    expect(updatePlatformSettingsSchema.safeParse({ trialLengthDays: 999 }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(updatePlatformSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown fields (.strict())', () => {
    expect(
      updatePlatformSettingsSchema.safeParse({ platformName: 'X', secretKey: 'hack' }).success,
    ).toBe(false);
  });
});
