import { describe, expect, it } from 'vitest';

import { CompanyModel } from '../company.model.js';

function buildValidCompany(overrides: Record<string, unknown> = {}) {
  return new CompanyModel({
    name: 'Studio Oslo',
    slug: 'studio-oslo',
    timezone: 'Europe/Oslo',
    currency: 'NOK',
    ...overrides,
  });
}

describe('CompanyModel validation', () => {
  it('accepts a well-formed company', () => {
    const company = buildValidCompany();
    expect(company.validateSync()).toBeUndefined();
  });

  it('defaults status to "draft" and bookingSettings to sane values', () => {
    const company = buildValidCompany();
    expect(company.status).toBe('draft');
    expect(company.bookingSettings.allowOnlineCancel).toBe(true);
    expect(company.bookingSettings.minNoticeMinutes).toBe(60);
  });

  it('rejects a missing name', () => {
    const company = buildValidCompany({ name: undefined });
    expect(company.validateSync()?.errors.name).toBeDefined();
  });

  it('normalizes slug case rather than rejecting it (schema applies lowercase)', () => {
    const company = buildValidCompany({ slug: 'Studio-Oslo' });
    expect(company.validateSync()).toBeUndefined();
    expect(company.slug).toBe('studio-oslo');
  });

  it('rejects a structurally invalid slug (spaces / double hyphen / leading or trailing hyphen)', () => {
    for (const badSlug of ['studio oslo', 'studio--oslo', '-studio', 'studio-']) {
      const company = buildValidCompany({ slug: badSlug });
      expect(
        company.validateSync()?.errors.slug,
        `slug "${badSlug}" should be rejected`,
      ).toBeDefined();
    }
  });

  it('rejects an invalid IANA timezone', () => {
    const company = buildValidCompany({ timezone: 'Not/ATimezone' });
    expect(company.validateSync()?.errors.timezone).toBeDefined();
  });

  it('accepts a valid IANA timezone other than the default', () => {
    const company = buildValidCompany({ timezone: 'America/New_York' });
    expect(company.validateSync()).toBeUndefined();
  });

  it('normalizes currency case rather than rejecting it (schema applies uppercase)', () => {
    const company = buildValidCompany({ currency: 'nok' });
    expect(company.validateSync()).toBeUndefined();
    expect(company.currency).toBe('NOK');
  });

  it('rejects a currency that is not a 3-letter ISO code', () => {
    for (const badCurrency of ['NO', 'NOKK', '123']) {
      const company = buildValidCompany({ currency: badCurrency });
      expect(
        company.validateSync()?.errors.currency,
        `currency "${badCurrency}" should be rejected`,
      ).toBeDefined();
    }
  });

  it('rejects an invalid status enum value', () => {
    const company = buildValidCompany({ status: 'deleted-forever' });
    expect(company.validateSync()?.errors.status).toBeDefined();
  });
});
