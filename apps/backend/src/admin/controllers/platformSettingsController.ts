// apps/backend/src/admin/controllers/platformSettingsController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { platformSettingsRepository } from '../repositories/platformSettingsRepository.js';
import { updatePlatformSettingsSchema } from '../validation/platformSettingsSchemas.js';

export const getPlatformSettings = asyncHandler(async (_req, res) => {
  const settings = await platformSettingsRepository.getOrCreateDefaults();
  res.status(200).json({ success: true, data: { settings } });
});

export const updatePlatformSettings = asyncHandler(async (req, res) => {
  const updates = parseOrThrow(updatePlatformSettingsSchema, req.body);
  const settings = await platformSettingsRepository.update(updates);

  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'platform_settings.updated',
    targetType: 'platform_settings',
    metadata: updates,
  });

  res.status(200).json({ success: true, data: { settings } });
});
