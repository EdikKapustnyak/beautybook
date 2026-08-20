import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { validateImageUpload } from '../../shared/storage/fileValidation.js';
import type { StoragePort } from '../../shared/storage/storagePort.js';
import { generateStorageKey } from '../../shared/storage/storageKey.js';
import type {
  PortfolioImageRecord,
  PortfolioImageRepositoryPort,
} from '../repositories/storageTypes.js';

export interface PortfolioServiceDeps {
  portfolioRepo: PortfolioImageRepositoryPort;
  storage: StoragePort;
  maxSizeBytes: number;
}

export function createPortfolioService(deps: PortfolioServiceDeps) {
  const { portfolioRepo, storage, maxSizeBytes } = deps;

  return {
    async uploadImage(companyId: string, buffer: Buffer): Promise<PortfolioImageRecord> {
      const validation = validateImageUpload(buffer, maxSizeBytes);
      if (!validation.valid || !validation.mimeType) {
        throw new ValidationError(validation.error ?? 'Invalid image upload.');
      }

      const storageKey = generateStorageKey(`portfolio/${companyId}`, validation.mimeType);
      await storage.putObject(storageKey, buffer, validation.mimeType);
      const url = storage.getPublicUrl(storageKey);

      return portfolioRepo.create(companyId, {
        storageKey,
        url,
        mimeType: validation.mimeType,
        sizeBytes: buffer.length,
      });
    },

    async listImages(companyId: string): Promise<PortfolioImageRecord[]> {
      return portfolioRepo.listInCompany(companyId);
    },

    async deleteImage(companyId: string, imageId: string): Promise<void> {
      const image = await portfolioRepo.findByIdInCompany(imageId, companyId);
      if (!image) {
        throw new NotFoundError('Portfolio image not found.');
      }
      // Storage deletion first — if it fails, the DB record (and thus the
      // still-live public URL) stays intact rather than silently
      // orphaning a storage object with no reference. See
      // security-measures.md §10.
      await storage.deleteObject(image.storageKey);
      await portfolioRepo.deleteByIdInCompany(imageId, companyId);
    },

    async reorder(companyId: string, orderedImageIds: string[]): Promise<void> {
      const existing = await portfolioRepo.listInCompany(companyId);
      const existingIds = new Set(existing.map((image) => image.id));
      const requestedIds = new Set(orderedImageIds);

      const exactMatch =
        orderedImageIds.length === existing.length &&
        [...requestedIds].every((id) => existingIds.has(id));

      if (!exactMatch) {
        throw new ValidationError(
          "orderedImageIds must contain exactly this company's current portfolio image ids, no more and no fewer.",
        );
      }

      await portfolioRepo.reorderInCompany(companyId, orderedImageIds);
    },
  };
}

export type PortfolioService = ReturnType<typeof createPortfolioService>;
