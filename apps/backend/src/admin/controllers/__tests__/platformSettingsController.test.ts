import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/platformSettingsRepository.js', () => ({
  platformSettingsRepository: { getOrCreateDefaults: vi.fn(), update: vi.fn() },
}));
vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { auditLogRepository } from '../../repositories/auditLogRepository.js';
import { platformSettingsRepository } from '../../repositories/platformSettingsRepository.js';
import { getPlatformSettings, updatePlatformSettings } from '../platformSettingsController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    adminAuth: { adminUserId: 'admin-1', role: 'superadmin' },
    ...overrides,
  } as unknown as Request;
}

function invokeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
): Promise<{ status: number; body: unknown } | { error: unknown }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        resolve({ status: statusCode, body });
      },
    } as unknown as Response;
    const next = ((err?: unknown) => {
      if (err) resolve({ error: err });
    }) as NextFunction;
    handler(req, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPlatformSettings', () => {
  it('returns the current settings', async () => {
    vi.mocked(platformSettingsRepository.getOrCreateDefaults).mockResolvedValue({
      platformName: 'BeautyBook',
    } as never);

    const result = await invokeHandler(getPlatformSettings, buildReq());

    expect('error' in result).toBe(false);
  });
});

describe('updatePlatformSettings', () => {
  it('updates and records an audit log entry', async () => {
    vi.mocked(platformSettingsRepository.update).mockResolvedValue({
      platformName: 'New Name',
    } as never);

    const result = await invokeHandler(
      updatePlatformSettings,
      buildReq({ body: { platformName: 'New Name' } }),
    );

    expect('error' in result).toBe(false);
    expect(platformSettingsRepository.update).toHaveBeenCalledWith({ platformName: 'New Name' });
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform_settings.updated' }),
    );
  });

  it('rejects an empty body before touching the repository', async () => {
    const result = await invokeHandler(updatePlatformSettings, buildReq({ body: {} }));

    expect('error' in result).toBe(true);
    expect(platformSettingsRepository.update).not.toHaveBeenCalled();
  });
});
