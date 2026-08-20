import { isValidObjectId } from 'mongoose';

import { UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { portfolioService } from '../services/portfolioService.instance.js';
import { reorderPortfolioSchema } from '../validation/portfolioSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

export const uploadPortfolioImage = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  if (!req.file) {
    throw new ValidationError('No file was uploaded (expected form field "file").');
  }

  const image = await portfolioService.uploadImage(companyId, req.file.buffer);
  res.status(201).json({ success: true, data: { image } });
});

export const listPortfolioImages = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const images = await portfolioService.listImages(companyId);
  res.status(200).json({ success: true, data: { images } });
});

export const deletePortfolioImage = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid portfolio image id.');
  }

  await portfolioService.deleteImage(companyId, id);
  res.status(200).json({ success: true, data: {} });
});

export const reorderPortfolioImages = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const input = parseOrThrow(reorderPortfolioSchema, req.body);

  await portfolioService.reorder(companyId, input.orderedImageIds);
  res.status(200).json({ success: true, data: {} });
});
