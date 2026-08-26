// apps/backend/src/admin/controllers/metricsController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { computeEstimatedMrr } from '../services/metricsService.js';

export const getMrr = asyncHandler(async (_req, res) => {
  const mrr = await computeEstimatedMrr();
  res.status(200).json({ success: true, data: { mrr } });
});
