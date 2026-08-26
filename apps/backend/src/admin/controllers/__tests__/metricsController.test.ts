// apps/backend/src/admin/controllers/__tests__/metricsController.test.ts

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/metricsService.js', () => ({
  computeEstimatedMrr: vi.fn(),
}));

import { computeEstimatedMrr } from '../../services/metricsService.js';
import { getMrr } from '../metricsController.js';

function invokeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
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
    handler({} as Request, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMrr', () => {
  it('returns the computed MRR summary', async () => {
    vi.mocked(computeEstimatedMrr).mockResolvedValue({
      totalEstimatedMrr: 235000,
      currency: 'NOK',
      totalActiveSubscriptions: 3,
      byPlan: [
        { plan: 'starter', activeSubscriptions: 2, estimatedMrr: 100000 },
        { plan: 'business', activeSubscriptions: 1, estimatedMrr: 135000 },
      ],
    });

    const result = await invokeHandler(getMrr);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.body).toEqual({
        success: true,
        data: {
          mrr: {
            totalEstimatedMrr: 235000,
            currency: 'NOK',
            totalActiveSubscriptions: 3,
            byPlan: [
              { plan: 'starter', activeSubscriptions: 2, estimatedMrr: 100000 },
              { plan: 'business', activeSubscriptions: 1, estimatedMrr: 135000 },
            ],
          },
        },
      });
    }
  });
});
