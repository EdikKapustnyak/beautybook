// apps/backend/src/shared/dto/__tests__/publicDto.test.ts
//
// Framework-free unit tests for the public DTO mappers — same testing
// philosophy as availabilityEngine.test.ts/slotLocking.test.ts (pure
// functions, structural fixtures, no Mongoose/Express needed).

import { describe, expect, it } from 'vitest';

import {
  toPublicCompanyDto,
  toPublicEmployeeDto,
  toPublicPortfolioImageDto,
  toPublicServiceDto,
} from '../publicDto.js';

describe('toPublicCompanyDto', () => {
  const baseSource = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Glow Studio',
    slug: 'glow-studio',
    timezone: 'Europe/Oslo',
    currency: 'NOK',
    theme: 'classic',
  };

  it('maps theme through unchanged', () => {
    const dto = toPublicCompanyDto({ ...baseSource, theme: 'modern' });
    expect(dto.theme).toBe('modern');
  });

  it('defaults socialLinks to an empty object when the source has none', () => {
    const dto = toPublicCompanyDto(baseSource);
    expect(dto.socialLinks).toEqual({});
  });

  it('passes through only the socialLinks that are actually set', () => {
    const dto = toPublicCompanyDto({
      ...baseSource,
      socialLinks: { instagram: 'https://instagram.com/glowstudio' },
    });
    expect(dto.socialLinks).toEqual({ instagram: 'https://instagram.com/glowstudio' });
    expect(dto.socialLinks.facebook).toBeUndefined();
  });

  it('never leaks internal-only fields (subscriptionId, status) even if present on the source', () => {
    const dto = toPublicCompanyDto({
      ...baseSource,
      // @ts-expect-error — deliberately passing fields the source type
      // doesn't declare, to prove the mapper only ever reads the fields
      // it explicitly lists, regardless of what's on the source object.
      subscriptionId: 'sub_secret123',
      status: 'active',
    });
    expect(dto).not.toHaveProperty('subscriptionId');
    expect(dto).not.toHaveProperty('status');
  });
});

describe('toPublicPortfolioImageDto — HANDOFF_2.md §4 item 6 (Landing editor)', () => {
  it('maps id/url/order and excludes internal storage fields', () => {
    const dto = toPublicPortfolioImageDto({
      _id: '507f1f77bcf86cd799439099',
      url: 'https://cdn.example.com/portfolio/abc.jpg',
      order: 2,
    });

    expect(dto).toEqual({
      id: '507f1f77bcf86cd799439099',
      url: 'https://cdn.example.com/portfolio/abc.jpg',
      order: 2,
    });
  });

  it('never leaks storageKey/mimeType/sizeBytes/companyId/active even if present on the source', () => {
    const dto = toPublicPortfolioImageDto({
      _id: '507f1f77bcf86cd799439099',
      url: 'https://cdn.example.com/portfolio/abc.jpg',
      order: 0,
      // @ts-expect-error — same deliberate over-supply as the company DTO
      // test above: the mapper must not read these even if a real
      // Mongoose document (which has all of them) is passed in.
      storageKey: 'portfolio/company123/abc.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 123456,
      companyId: '507f1f77bcf86cd799439011',
      active: true,
    });

    expect(dto).not.toHaveProperty('storageKey');
    expect(dto).not.toHaveProperty('mimeType');
    expect(dto).not.toHaveProperty('sizeBytes');
    expect(dto).not.toHaveProperty('companyId');
    expect(dto).not.toHaveProperty('active');
  });
});

describe('toPublicServiceDto / toPublicEmployeeDto — regression guard', () => {
  it('toPublicServiceDto still maps id/employeeIds to strings', () => {
    const dto = toPublicServiceDto({
      _id: '507f1f77bcf86cd799439012',
      name: 'Manicure',
      price: 500,
      currency: 'NOK',
      durationMinutes: 60,
      bufferMinutes: 15,
      employeeIds: ['507f1f77bcf86cd799439011'],
    });
    expect(dto.id).toBe('507f1f77bcf86cd799439012');
    expect(dto.employeeIds).toEqual(['507f1f77bcf86cd799439011']);
  });

  it('toPublicEmployeeDto still excludes contact/schedule fields', () => {
    const dto = toPublicEmployeeDto({
      _id: '507f1f77bcf86cd799439011',
      name: 'Maria',
      serviceIds: ['507f1f77bcf86cd799439012'],
    });
    expect(dto).toEqual({
      id: '507f1f77bcf86cd799439011',
      name: 'Maria',
      serviceIds: ['507f1f77bcf86cd799439012'],
    });
  });
});
