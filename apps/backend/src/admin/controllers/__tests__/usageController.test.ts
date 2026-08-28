import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/usageService.js', () => ({
  computeUsageOverview: vi.fn(),
}));

import { computeUsageOverview } from '../../services/usageService.js';
import { getUsageOverview } from '../usageController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, params: {}, query: {}, body: {}, ...overrides } as unknown as Request;
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

describe('getUsageOverview', () => {
  it('passes the parsed days window through to the service', async () => {
    vi.mocked(computeUsageOverview).mockResolvedValue({
      windowDays: 7,
      totalBookings: 0,
      totalSms: 0,
      totalStorageBytes: 0,
      dailyBookings: [],
      companies: [],
    });

    const result = await invokeHandler(getUsageOverview, buildReq({ query: { days: '7' } }));

    expect('error' in result).toBe(false);
    expect(computeUsageOverview).toHaveBeenCalledWith(7);
  });

  it('defaults to 30 days when not specified', async () => {
    vi.mocked(computeUsageOverview).mockResolvedValue({
      windowDays: 30,
      totalBookings: 0,
      totalSms: 0,
      totalStorageBytes: 0,
      dailyBookings: [],
      companies: [],
    });

    await invokeHandler(getUsageOverview, buildReq());

    expect(computeUsageOverview).toHaveBeenCalledWith(30);
  });
});
