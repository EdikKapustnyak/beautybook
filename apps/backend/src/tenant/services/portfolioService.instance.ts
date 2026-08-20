import { env } from '../../config/env.js';
import { s3Storage } from '../../shared/storage/s3Storage.js';
import { mongoPortfolioImageRepositoryPort } from '../repositories/storageRepositoryAdapters.js';
import { createPortfolioService } from './portfolioService.js';

export const portfolioService = createPortfolioService({
  portfolioRepo: mongoPortfolioImageRepositoryPort,
  storage: s3Storage,
  maxSizeBytes: env.PORTFOLIO_IMAGE_MAX_SIZE_BYTES,
});
