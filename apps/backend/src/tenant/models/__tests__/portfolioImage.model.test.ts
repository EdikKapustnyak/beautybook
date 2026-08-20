import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { PortfolioImageModel } from '../portfolioImage.model.js';

function buildValidImage(overrides: Record<string, unknown> = {}) {
  return new PortfolioImageModel({
    companyId: new Types.ObjectId(),
    storageKey: 'portfolio/company-1/abc.jpg',
    url: 'https://cdn.example.com/portfolio/company-1/abc.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 12345,
    ...overrides,
  });
}

describe('PortfolioImageModel validation', () => {
  it('accepts a well-formed portfolio image', () => {
    const image = buildValidImage();
    expect(image.validateSync()).toBeUndefined();
  });

  it('requires companyId, storageKey, url, mimeType, sizeBytes', () => {
    for (const field of ['companyId', 'storageKey', 'url', 'mimeType', 'sizeBytes']) {
      const image = buildValidImage({ [field]: undefined });
      expect(image.validateSync()?.errors[field]).toBeDefined();
    }
  });

  it('rejects a zero or negative sizeBytes', () => {
    const image = buildValidImage({ sizeBytes: 0 });
    expect(image.validateSync()?.errors.sizeBytes).toBeDefined();
  });

  it('defaults order to 0', () => {
    const image = buildValidImage();
    expect(image.order).toBe(0);
  });

  it('defaults active to true', () => {
    const image = buildValidImage();
    expect(image.active).toBe(true);
  });
});
