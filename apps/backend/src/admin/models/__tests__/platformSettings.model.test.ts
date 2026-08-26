import { describe, expect, it } from 'vitest';

import { PlatformSettingsModel } from '../platformSettings.model.js';

function buildValid(overrides: Record<string, unknown> = {}) {
  return new PlatformSettingsModel({
    platformName: 'BeautyBook',
    supportEmail: 'support@beautybook.no',
    defaultCurrency: 'nok',
    trialLengthDays: 14,
    ...overrides,
  });
}

describe('PlatformSettingsModel validation', () => {
  it('accepts a well-formed document and uppercases currency / lowercases email', () => {
    const doc = buildValid({ supportEmail: 'Support@BeautyBook.no' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.defaultCurrency).toBe('NOK');
    expect(doc.supportEmail).toBe('support@beautybook.no');
  });

  it('rejects a missing platformName', () => {
    const doc = buildValid({ platformName: undefined });
    expect(doc.validateSync()?.errors.platformName).toBeDefined();
  });

  it('rejects a currency that is not exactly 3 characters', () => {
    const doc = buildValid({ defaultCurrency: 'NOKR' });
    expect(doc.validateSync()?.errors.defaultCurrency).toBeDefined();
  });

  it('rejects a negative trialLengthDays', () => {
    const doc = buildValid({ trialLengthDays: -1 });
    expect(doc.validateSync()?.errors.trialLengthDays).toBeDefined();
  });

  it('rejects trialLengthDays above 365', () => {
    const doc = buildValid({ trialLengthDays: 400 });
    expect(doc.validateSync()?.errors.trialLengthDays).toBeDefined();
  });
});
