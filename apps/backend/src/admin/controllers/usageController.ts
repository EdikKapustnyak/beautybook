// apps/backend/src/admin/controllers/usageController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { computeUsageOverview } from '../services/usageService.js';
import { usageQuerySchema } from '../validation/usageSchemas.js';

export const getUsageOverview = asyncHandler(async (req, res) => {
  const { days } = parseOrThrow(usageQuerySchema, req.query);
  const usage = await computeUsageOverview(days);
  res.status(200).json({ success: true, data: { usage } });
});
