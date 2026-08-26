// apps/backend/src/admin/controllers/__tests__/planConfigController.test.ts

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/billing/adapters.js', () => ({
  mongoPlanConfigRepositoryPort: {
    findOrSeedByPlan: vi.fn(),
    updateByPlan: vi.fn(),
  },
}));
vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { mongoPlanConfigRepositoryPort } from '../../../shared/billing/adapters.js';
import { listPlanConfigs, updatePlanConfig } from '../planConfigController.js';

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

const STARTER_CONFIG = {
  plan: 'starter' as const,
  displayName: 'Starter',
  priceAmount: 0,
  currency: 'NOK',
  discountPercent: 0,
  stripePriceId: 'price_starter_test',
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listPlanConfigs', () => {
  it('seeds and returns every plan', async () => {
    vi.mocked(mongoPlanConfigRepositoryPort.findOrSeedByPlan).mockResolvedValue(STARTER_CONFIG);

    const result = await invokeHandler(listPlanConfigs, buildReq());

    expect('error' in result).toBe(false);
    expect(mongoPlanConfigRepositoryPort.findOrSeedByPlan).toHaveBeenCalledTimes(2); // starter + business
  });
});

describe('updatePlanConfig', () => {
  it('updates the given plan and returns it', async () => {
    vi.mocked(mongoPlanConfigRepositoryPort.findOrSeedByPlan).mockResolvedValue(STARTER_CONFIG);
    vi.mocked(mongoPlanConfigRepositoryPort.updateByPlan).mockResolvedValue({
      ...STARTER_CONFIG,
      discountPercent: 15,
    });

    const result = await invokeHandler(
      updatePlanConfig,
      buildReq({ params: { plan: 'starter' }, body: { discountPercent: 15 } }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.body).toEqual({
        success: true,
        data: { plan: { ...STARTER_CONFIG, discountPercent: 15 } },
      });
    }
    expect(mongoPlanConfigRepositoryPort.updateByPlan).toHaveBeenCalledWith('starter', {
      discountPercent: 15,
    });
  });

  it('rejects an invalid plan param', async () => {
    const result = await invokeHandler(
      updatePlanConfig,
      buildReq({ params: { plan: 'enterprise' }, body: { discountPercent: 15 } }),
    );

    expect('error' in result).toBe(true);
    expect(mongoPlanConfigRepositoryPort.updateByPlan).not.toHaveBeenCalled();
  });

  it('rejects an empty body', async () => {
    const result = await invokeHandler(
      updatePlanConfig,
      buildReq({ params: { plan: 'starter' }, body: {} }),
    );

    expect('error' in result).toBe(true);
    expect(mongoPlanConfigRepositoryPort.updateByPlan).not.toHaveBeenCalled();
  });

  it('rejects a discountPercent above 100', async () => {
    const result = await invokeHandler(
      updatePlanConfig,
      buildReq({ params: { plan: 'starter' }, body: { discountPercent: 150 } }),
    );

    expect('error' in result).toBe(true);
  });
});
