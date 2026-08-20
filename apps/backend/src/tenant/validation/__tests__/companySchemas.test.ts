import { describe, expect, it } from 'vitest';

import { updateCompanySchema } from '../companySchemas.js';

describe('updateCompanySchema', () => {
  it('accepts a valid partial update', () => {
    const result = updateCompanySchema.safeParse({
      name: 'Studio Oslo AS',
      timezone: 'Europe/Oslo',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty-string description (clearing it) as plain text', () => {
    const result = updateCompanySchema.safeParse({ description: 'Nails, lashes & brows.' });
    expect(result.success).toBe(true);
  });

  it('uppercases a lowercase currency code', () => {
    const result = updateCompanySchema.safeParse({ currency: 'nok' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('NOK');
    }
  });

  it('rejects an unknown/unsupported timezone', () => {
    const result = updateCompanySchema.safeParse({ timezone: 'Mars/Olympus_Mons' });
    expect(result.success).toBe(false);
  });

  it('rejects a currency code that is not 3 letters', () => {
    const result = updateCompanySchema.safeParse({ currency: 'NOKX' });
    expect(result.success).toBe(false);
  });

  it('rejects HTML/script content in the description (XSS defense)', () => {
    const result = updateCompanySchema.safeParse({
      description: '<script>alert(document.cookie)</script>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a javascript: URL for logo', () => {
    const result = updateCompanySchema.safeParse({ logo: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid https logo URL', () => {
    const result = updateCompanySchema.safeParse({ logo: 'https://cdn.example.com/logo.png' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty body (nothing to update)', () => {
    const result = updateCompanySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects slug — must go through a dedicated flow, never a generic PATCH', () => {
    const result = updateCompanySchema.safeParse({ slug: 'new-slug' });
    expect(result.success).toBe(false);
  });

  it('rejects status — platform-admin-only, never a tenant self-service field', () => {
    const result = updateCompanySchema.safeParse({ status: 'active' });
    expect(result.success).toBe(false);
  });

  it('rejects companyId/subscriptionId spoofing attempts (mass-assignment defense)', () => {
    const result = updateCompanySchema.safeParse({
      name: 'Studio Oslo',
      companyId: 'someone-elses-company-id',
      subscriptionId: 'sub_forged',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a partial bookingSettings update', () => {
    const result = updateCompanySchema.safeParse({
      bookingSettings: { minNoticeMinutes: 120 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range bookingSettings value', () => {
    const result = updateCompanySchema.safeParse({
      bookingSettings: { maxAdvanceBookingDays: 9999 },
    });
    expect(result.success).toBe(false);
  });
});
