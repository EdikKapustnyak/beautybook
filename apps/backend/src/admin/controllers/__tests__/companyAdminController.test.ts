// apps/backend/src/admin/controllers/__tests__/companyAdminController.test.ts

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/companyAdminRepository.js', () => ({
  companyAdminRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock('../../../shared/billing/adapters.js', () => ({
  mongoSubscriptionRepositoryPort: { findByCompanyId: vi.fn() },
}));
vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { mongoSubscriptionRepositoryPort } from '../../../shared/billing/adapters.js';
import { companyAdminRepository } from '../../repositories/companyAdminRepository.js';
import { getCompany, listCompanies, updateCompanyStatus } from '../companyAdminController.js';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

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

const COMPANY_RECORD = {
  id: VALID_COMPANY_ID,
  name: 'Glow Studio',
  slug: 'glow-studio',
  status: 'active' as const,
  timezone: 'Europe/Oslo',
  currency: 'NOK',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listCompanies', () => {
  it('joins each company with its subscription status/plan', async () => {
    vi.mocked(companyAdminRepository.list).mockResolvedValue({
      items: [COMPANY_RECORD],
      total: 1,
    });
    vi.mocked(mongoSubscriptionRepositoryPort.findByCompanyId).mockResolvedValue({
      id: 'sub-1',
      companyId: VALID_COMPANY_ID,
      plan: 'starter',
      status: 'active',
      cancelAtPeriodEnd: false,
      grantedByAdmin: false,
    });

    const result = await invokeHandler(
      listCompanies,
      buildReq({ query: { page: '1', limit: '20' } }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      const body = result.body as { data: { companies: unknown[] } };
      expect(body.data.companies[0]).toMatchObject({
        id: VALID_COMPANY_ID,
        subscriptionStatus: 'active',
        subscriptionPlan: 'starter',
      });
    }
  });

  it('reports null subscription fields for a company with none yet', async () => {
    vi.mocked(companyAdminRepository.list).mockResolvedValue({
      items: [COMPANY_RECORD],
      total: 1,
    });
    vi.mocked(mongoSubscriptionRepositoryPort.findByCompanyId).mockResolvedValue(null);

    const result = await invokeHandler(listCompanies, buildReq());

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      const body = result.body as { data: { companies: unknown[] } };
      expect(body.data.companies[0]).toMatchObject({
        subscriptionStatus: null,
        subscriptionPlan: null,
      });
    }
  });

  it('rejects an invalid status filter', async () => {
    const result = await invokeHandler(listCompanies, buildReq({ query: { status: 'archived' } }));

    expect('error' in result).toBe(true);
    expect(companyAdminRepository.list).not.toHaveBeenCalled();
  });
});

describe('getCompany', () => {
  it('returns 404 for an unknown company', async () => {
    vi.mocked(companyAdminRepository.findById).mockResolvedValue(null);

    const result = await invokeHandler(
      getCompany,
      buildReq({ params: { companyId: VALID_COMPANY_ID } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });

  it('rejects an invalid company id format', async () => {
    const result = await invokeHandler(getCompany, buildReq({ params: { companyId: 'bad' } }));

    expect('error' in result).toBe(true);
    expect(companyAdminRepository.findById).not.toHaveBeenCalled();
  });
});

describe('updateCompanyStatus', () => {
  it('suspends a company', async () => {
    vi.mocked(companyAdminRepository.updateStatus).mockResolvedValue({
      ...COMPANY_RECORD,
      status: 'suspended',
    });

    const result = await invokeHandler(
      updateCompanyStatus,
      buildReq({ params: { companyId: VALID_COMPANY_ID }, body: { status: 'suspended' } }),
    );

    expect('error' in result).toBe(false);
    expect(companyAdminRepository.updateStatus).toHaveBeenCalledWith(VALID_COMPANY_ID, 'suspended');
  });

  it('rejects an invalid status value', async () => {
    const result = await invokeHandler(
      updateCompanyStatus,
      buildReq({ params: { companyId: VALID_COMPANY_ID }, body: { status: 'deleted' } }),
    );

    expect('error' in result).toBe(true);
    expect(companyAdminRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown company', async () => {
    vi.mocked(companyAdminRepository.updateStatus).mockResolvedValue(null);

    const result = await invokeHandler(
      updateCompanyStatus,
      buildReq({ params: { companyId: VALID_COMPANY_ID }, body: { status: 'active' } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});
