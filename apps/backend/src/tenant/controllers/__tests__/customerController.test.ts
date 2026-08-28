// apps/backend/src/tenant/controllers/__tests__/customerController.test.ts
//
// dev-tasks.md §12's checklist items this file closes at the controller
// layer: "unauthorized customer access" (cross-tenant id lookup returns
// 404, never another tenant's data) and "pagination abuse"/"huge query"
// (rejected by listCustomersQuerySchema before the repository is ever
// touched). Repository-level regex-injection/ReDoS/tenant-scoping is
// covered separately in customerRepository.test.ts.

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/customerRepository.js', () => ({
  customerRepository: {
    createInCompany: vi.fn(),
    listInCompany: vi.fn(),
    findByIdInCompany: vi.fn(),
    updateInCompany: vi.fn(),
    anonymizeInCompany: vi.fn(),
  },
}));
vi.mock('../../repositories/bookingRepository.js', () => ({
  bookingRepository: { listInCompany: vi.fn() },
}));

import { bookingRepository } from '../../repositories/bookingRepository.js';
import { customerRepository } from '../../repositories/customerRepository.js';
import {
  anonymizeCustomer,
  getCustomer,
  getCustomerBookings,
  listCustomers,
} from '../customerController.js';

const VALID_CUSTOMER_ID = '507f1f77bcf86cd799439011';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    tenantAuth: { userId: 'user-1', companyId: 'company-1', role: 'owner' },
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

describe('getCustomer — unauthorized/cross-tenant access', () => {
  it("returns 404 (never another tenant's data) when the repository finds nothing in THIS company", async () => {
    // The repository itself is tenant-scoped (proven in
    // customerRepository.test.ts) — this simulates exactly what happens
    // when a caller from company-1 requests a customer id that actually
    // belongs to company-2: findByIdInCompany('id', 'company-1') finds
    // nothing, and the controller must surface that as NotFound, not
    // accidentally fall through to some other lookup.
    vi.mocked(customerRepository.findByIdInCompany).mockResolvedValue(null);

    const result = await invokeHandler(
      getCustomer,
      buildReq({ params: { id: VALID_CUSTOMER_ID } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
    expect(customerRepository.findByIdInCompany).toHaveBeenCalledWith(
      VALID_CUSTOMER_ID,
      'company-1',
    );
  });

  it('rejects a malformed id before ever touching the repository (no enumeration probing via error timing/shape)', async () => {
    const result = await invokeHandler(getCustomer, buildReq({ params: { id: 'not-an-id' } }));

    expect('error' in result).toBe(true);
    expect(customerRepository.findByIdInCompany).not.toHaveBeenCalled();
  });

  it("scopes strictly to the caller's own companyId, never a value from the request body/query", async () => {
    vi.mocked(customerRepository.findByIdInCompany).mockResolvedValue({
      id: VALID_CUSTOMER_ID,
      name: 'Kari',
    } as never);

    await invokeHandler(
      getCustomer,
      buildReq({
        params: { id: VALID_CUSTOMER_ID },
        // Deliberately trying to smuggle a different companyId through
        // the query string, the way an attacker would — Express's loose
        // query typing doesn't reject this at compile time, which is
        // exactly why the runtime check (asserted below) matters.
        query: { companyId: 'attacker-company' },
      }),
    );

    expect(customerRepository.findByIdInCompany).toHaveBeenCalledWith(
      VALID_CUSTOMER_ID,
      'company-1', // from tenantAuth (verified), never the spoofed query value
    );
  });
});

describe('getCustomerBookings — cross-tenant', () => {
  it("404s before ever calling bookingRepository if the customer isn't in this company", async () => {
    vi.mocked(customerRepository.findByIdInCompany).mockResolvedValue(null);

    const result = await invokeHandler(
      getCustomerBookings,
      buildReq({ params: { id: VALID_CUSTOMER_ID } }),
    );

    expect('error' in result).toBe(true);
    expect(bookingRepository.listInCompany).not.toHaveBeenCalled();
  });
});

describe('anonymizeCustomer — cross-tenant', () => {
  it("returns 404 rather than anonymizing another tenant's customer", async () => {
    vi.mocked(customerRepository.anonymizeInCompany).mockResolvedValue(null);

    const result = await invokeHandler(
      anonymizeCustomer,
      buildReq({ params: { id: VALID_CUSTOMER_ID } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});

describe('listCustomers — pagination/search passthrough', () => {
  it('rejects a search term over the length cap before touching the repository (huge query)', async () => {
    const result = await invokeHandler(
      listCustomers,
      buildReq({ query: { search: 'a'.repeat(1000) } }),
    );

    expect('error' in result).toBe(true);
    expect(customerRepository.listInCompany).not.toHaveBeenCalled();
  });

  it('rejects a limit above the pagination cap (pagination abuse)', async () => {
    const result = await invokeHandler(listCustomers, buildReq({ query: { limit: '999999' } }));

    expect('error' in result).toBe(true);
    expect(customerRepository.listInCompany).not.toHaveBeenCalled();
  });

  it('passes a valid search/tag/pagination combination straight through', async () => {
    vi.mocked(customerRepository.listInCompany).mockResolvedValue({ items: [], total: 0 });

    const result = await invokeHandler(
      listCustomers,
      buildReq({ query: { search: 'Kari', tag: 'VIP', page: '2', limit: '10' } }),
    );

    expect('error' in result).toBe(false);
    expect(customerRepository.listInCompany).toHaveBeenCalledWith('company-1', {
      search: 'Kari',
      tag: 'VIP',
      page: 2,
      limit: 10,
    });
  });
});
