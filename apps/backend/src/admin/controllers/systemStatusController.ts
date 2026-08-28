// apps/backend/src/admin/controllers/systemStatusController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { computeSystemStatus } from '../services/systemStatusService.js';

export const getSystemStatus = asyncHandler(async (_req, res) => {
  const status = await computeSystemStatus();
  res.status(200).json({ success: true, data: { status } });
});
