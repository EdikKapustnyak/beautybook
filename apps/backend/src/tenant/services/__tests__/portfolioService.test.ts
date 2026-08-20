import { describe, expect, it } from 'vitest';

import { createInMemoryStorage } from '../../../shared/storage/__tests__/inMemoryStorage.js';
import { createPortfolioService } from '../portfolioService.js';
import { createInMemoryPortfolioRepo } from './inMemoryStoragePorts.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const HTML_BYTES = Buffer.from('<html><script>alert(1)</script></html>', 'ascii');
const COMPANY_ID = 'company-1';

function buildService() {
  const storage = createInMemoryStorage();
  const portfolioRepo = createInMemoryPortfolioRepo();
  const service = createPortfolioService({
    portfolioRepo,
    storage,
    maxSizeBytes: 5 * 1024 * 1024,
  });
  return { service, storage, portfolioRepo };
}

describe('portfolioService.uploadImage', () => {
  it('stores the object and creates a record for a valid image', async () => {
    const { service, storage } = buildService();
    const image = await service.uploadImage(COMPANY_ID, JPEG_BYTES);

    expect(image.mimeType).toBe('image/jpeg');
    expect(storage.has(image.storageKey)).toBe(true);
  });

  it('rejects an invalid file and never writes to storage', async () => {
    const { service, storage } = buildService();

    await expect(service.uploadImage(COMPANY_ID, HTML_BYTES)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(storage.size()).toBe(0);
  });

  it('rejects an oversized file', async () => {
    const { service } = buildService();
    const oversized = Buffer.concat([JPEG_BYTES, Buffer.alloc(10 * 1024 * 1024)]);

    await expect(service.uploadImage(COMPANY_ID, oversized)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('scopes the storage key under the company id, not a user-controlled path', async () => {
    const { service } = buildService();
    const image = await service.uploadImage(COMPANY_ID, JPEG_BYTES);
    expect(image.storageKey.startsWith(`portfolio/${COMPANY_ID}/`)).toBe(true);
  });
});

describe('portfolioService.deleteImage', () => {
  it('removes the storage object and the DB record', async () => {
    const { service, storage } = buildService();
    const image = await service.uploadImage(COMPANY_ID, JPEG_BYTES);

    await service.deleteImage(COMPANY_ID, image.id);

    expect(storage.has(image.storageKey)).toBe(false);
    await expect(service.deleteImage(COMPANY_ID, image.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NotFoundError for an unauthorized/cross-tenant delete attempt', async () => {
    const { service } = buildService();
    const image = await service.uploadImage(COMPANY_ID, JPEG_BYTES);

    await expect(service.deleteImage('another-company', image.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('leaves the storage object in place if the record does not belong to the caller', async () => {
    const { service, storage } = buildService();
    const image = await service.uploadImage(COMPANY_ID, JPEG_BYTES);

    try {
      await service.deleteImage('another-company', image.id);
    } catch {
      // expected
    }

    expect(storage.has(image.storageKey)).toBe(true);
  });
});

describe('portfolioService.reorder', () => {
  it('applies a new order to exactly-matching ids', async () => {
    const { service, portfolioRepo } = buildService();
    const first = await service.uploadImage(COMPANY_ID, JPEG_BYTES);
    const second = await service.uploadImage(COMPANY_ID, JPEG_BYTES);

    await service.reorder(COMPANY_ID, [second.id, first.id]);

    const listed = await portfolioRepo.listInCompany(COMPANY_ID);
    expect(listed.map((image) => image.id)).toEqual([second.id, first.id]);
  });

  it('rejects a reorder list missing an existing image', async () => {
    const { service } = buildService();
    const first = await service.uploadImage(COMPANY_ID, JPEG_BYTES);
    await service.uploadImage(COMPANY_ID, JPEG_BYTES);

    await expect(service.reorder(COMPANY_ID, [first.id])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a reorder list containing an id from another company', async () => {
    const { service } = buildService();
    const mine = await service.uploadImage(COMPANY_ID, JPEG_BYTES);
    const foreign = await service.uploadImage('another-company', JPEG_BYTES);

    await expect(service.reorder(COMPANY_ID, [mine.id, foreign.id])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
