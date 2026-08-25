import { beforeEach, describe, expect, it } from 'vitest';

import { createCompanyService } from '../companyService.js';
import { createInMemoryCompanyRepo } from './inMemoryPorts.js';

function buildService() {
  const companyRepo = createInMemoryCompanyRepo();
  const service = createCompanyService({ companyRepo });
  return { service, companyRepo };
}

describe('companyService.getCompany', () => {
  it('returns the company profile', async () => {
    const { service, companyRepo } = buildService();
    const company = await companyRepo.create({
      name: 'Studio Oslo',
      slug: 'studio-oslo',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
    });

    const result = await service.getCompany(company.id);
    expect(result.name).toBe('Studio Oslo');
  });

  it('throws NotFoundError for an unknown company id', async () => {
    const { service } = buildService();
    await expect(service.getCompany('does-not-exist')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('companyService.updateCompany', () => {
  let service: ReturnType<typeof buildService>['service'];
  let companyId: string;

  beforeEach(async () => {
    const built = buildService();
    service = built.service;
    const company = await built.companyRepo.create({
      name: 'Studio Oslo',
      slug: 'studio-oslo',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
    });
    companyId = company.id;
  });

  it('updates simple fields', async () => {
    const result = await service.updateCompany(companyId, { name: 'Studio Oslo AS' });
    expect(result.name).toBe('Studio Oslo AS');
  });

  it('throws NotFoundError when updating an unknown company', async () => {
    await expect(service.updateCompany('does-not-exist', { name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('merges a partial bookingSettings update instead of replacing the whole object', async () => {
    const result = await service.updateCompany(companyId, {
      bookingSettings: { minNoticeMinutes: 120 },
    });

    expect(result.bookingSettings.minNoticeMinutes).toBe(120);
    // Untouched fields must survive the merge, not reset to schema defaults.
    expect(result.bookingSettings.allowOnlineCancel).toBe(true);
    expect(result.bookingSettings.allowOnlineReschedule).toBe(true);
    expect(result.bookingSettings.maxAdvanceBookingDays).toBe(60);
  });

  it('applies two sequential partial bookingSettings updates additively', async () => {
    await service.updateCompany(companyId, { bookingSettings: { minNoticeMinutes: 90 } });
    const result = await service.updateCompany(companyId, {
      bookingSettings: { maxAdvanceBookingDays: 30 },
    });

    expect(result.bookingSettings.minNoticeMinutes).toBe(90);
    expect(result.bookingSettings.maxAdvanceBookingDays).toBe(30);
  });

  it('updates theme directly (fixed enum, no merge needed)', async () => {
    const result = await service.updateCompany(companyId, { theme: 'modern' });
    expect(result.theme).toBe('modern');
  });

  it('merges a partial socialLinks update instead of replacing the whole object', async () => {
    await service.updateCompany(companyId, {
      socialLinks: { instagram: 'https://instagram.com/glowstudio' },
    });
    const result = await service.updateCompany(companyId, {
      socialLinks: { facebook: 'https://facebook.com/glowstudio' },
    });

    // Untouched field from the first call must survive the second's merge.
    expect(result.socialLinks.instagram).toBe('https://instagram.com/glowstudio');
    expect(result.socialLinks.facebook).toBe('https://facebook.com/glowstudio');
  });
});
