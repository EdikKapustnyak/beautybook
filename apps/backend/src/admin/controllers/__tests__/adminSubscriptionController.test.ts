// apps/backend/src/admin/controllers/__tests__/adminSubscriptionController.test.ts

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/billing/adapters.js', () => ({
  mongoSubscriptionRepositoryPort: { findByCompanyId: vi.fn() },
}));
vi.mock('../../../shared/billing/grantSubscription.js', () => ({
  grantSubscription: vi.fn(),
}));
vi.mock('../../repositories/companyExistsAdapter.js', () => ({
  companyExistsAdapter: { exists: vi.fn() },
}));
vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { mongoSubscriptionRepositoryPort } from '../../../shared/billing/adapters.js';
import { grantSubscription } from '../../../shared/billing/grantSubscription.js';
import {
  getCompanySubscription,
  grantSubscriptionHandler,
} from '../adminSubscriptionController.js';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: { companyId: VALID_COMPANY_ID },
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

describe('getCompanySubscription', () => {
  it('returns the subscription for a valid company id', async () => {
    vi.mocked(mongoSubscriptionRepositoryPort.findByCompanyId).mockResolvedValue({
      id: 'sub-1',
      companyId: VALID_COMPANY_ID,
      plan: 'starter',
      status: 'active',
      cancelAtPeriodEnd: false,
      grantedByAdmin: false,
    });

    const result = await invokeHandler(getCompanySubscription, buildReq());

    expect('error' in result).toBe(false);
    expect(mongoSubscriptionRepositoryPort.findByCompanyId).toHaveBeenCalledWith(VALID_COMPANY_ID);
  });

  it('rejects an invalid company id format without touching the repository', async () => {
    const result = await invokeHandler(
      getCompanySubscription,
      buildReq({ params: { companyId: 'not-an-id' } }),
    );

    expect('error' in result).toBe(true);
    expect(mongoSubscriptionRepositoryPort.findByCompanyId).not.toHaveBeenCalled();
  });
});

describe('grantSubscriptionHandler', () => {
  it('calls the shared grantSubscription function with the parsed input', async () => {
    vi.mocked(grantSubscription).mockResolvedValue({
      id: 'sub-1',
      companyId: VALID_COMPANY_ID,
      plan: 'business',
      status: 'active',
      cancelAtPeriodEnd: false,
      grantedByAdmin: true,
      grantedReason: 'partner deal',
    });

    const result = await invokeHandler(
      grantSubscriptionHandler,
      buildReq({ body: { plan: 'business', reason: 'partner deal' } }),
    );

    expect('error' in result).toBe(false);
    expect(grantSubscription).toHaveBeenCalledWith(expect.objectContaining({}), {
      companyId: VALID_COMPANY_ID,
      plan: 'business',
      reason: 'partner deal',
    });
  });

  it('rejects an invalid plan value before calling grantSubscription', async () => {
    const result = await invokeHandler(
      grantSubscriptionHandler,
      buildReq({ body: { plan: 'enterprise' } }),
    );

    expect('error' in result).toBe(true);
    expect(grantSubscription).not.toHaveBeenCalled();
  });

  it('propagates a NotFoundError from grantSubscription (e.g. unknown company)', async () => {
    const { NotFoundError } = await import('../../../shared/errors/AppError.js');
    vi.mocked(grantSubscription).mockRejectedValue(new NotFoundError('Company not found.'));

    const result = await invokeHandler(
      grantSubscriptionHandler,
      buildReq({ body: { plan: 'starter' } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});
