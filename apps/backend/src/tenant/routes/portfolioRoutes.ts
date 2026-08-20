import { Router } from 'express';

import { env } from '../../config/env.js';
import { uploadSingleImage } from '../../shared/http/upload.js';
import {
  deletePortfolioImage,
  listPortfolioImages,
  reorderPortfolioImages,
  uploadPortfolioImage,
} from '../controllers/portfolioController.js';
import { requireTenantAuth, requireTenantRole } from '../middleware/requireTenantAuth.js';

export const portfolioRouter: Router = Router();

const canManagePortfolio = requireTenantRole('owner', 'admin', 'manager');
const uploadMiddleware = uploadSingleImage(env.PORTFOLIO_IMAGE_MAX_SIZE_BYTES);

portfolioRouter.get('/', requireTenantAuth, listPortfolioImages);
portfolioRouter.post(
  '/',
  requireTenantAuth,
  canManagePortfolio,
  uploadMiddleware,
  uploadPortfolioImage,
);
portfolioRouter.patch('/reorder', requireTenantAuth, canManagePortfolio, reorderPortfolioImages);
portfolioRouter.delete('/:id', requireTenantAuth, canManagePortfolio, deletePortfolioImage);
