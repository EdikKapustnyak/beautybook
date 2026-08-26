import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/subscriptionsOverviewService.js', () => ({
  computeSubscriptionsKpis: vi.fn(),
  listSubscriptionsOverview: vi.fn(),
}));

import {
  computeSubscriptionsKpis,
  listSubscriptionsOverview,
} from '../../services/subscriptionsOverviewService.js';
import { getSubscriptionsOverview } from '../subscriptionsOverviewController.js';

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

describe('getSubscriptionsOverview', () => {
  it('returns KPIs and paginated subscriptions together', async () => {
    vi.mocked(computeSubscriptionsKpis).mockResolvedValue({
      activeSubscriptions: 3,
      pastDueSubscriptions: 1,
      trialingSubscriptions: 0,
      canceledSubscriptions: 2,
    });
    vi.mocked(listSubscriptionsOverview).mockResolvedValue({
      items: [
        {
          companyId: 'company-1',
          companyName: 'Glow Studio',
          plan: 'starter',
          status: 'active',
          nextInvoice: '2026-09-01T00:00:00.000Z',
          estimatedAmount: 50000,
        },
      ],
      total: 1,
    });

    const result = await invokeHandler(
      getSubscriptionsOverview,
      buildReq({ query: { page: '1', limit: '20' } }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.body).toEqual({
        success: true,
        data: {
          kpis: {
            activeSubscriptions: 3,
            pastDueSubscriptions: 1,
            trialingSubscriptions: 0,
            canceledSubscriptions: 2,
          },
          subscriptions: [
            {
              companyId: 'company-1',
              companyName: 'Glow Studio',
              plan: 'starter',
              status: 'active',
              nextInvoice: '2026-09-01T00:00:00.000Z',
              estimatedAmount: 50000,
            },
          ],
          pagination: { page: 1, limit: 20, total: 1 },
        },
      });
    }
    expect(listSubscriptionsOverview).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });
});
