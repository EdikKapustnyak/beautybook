import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/userAdminRepository.js', () => ({
  userAdminRepository: { list: vi.fn() },
}));
vi.mock('../../repositories/companyAdminRepository.js', () => ({
  companyAdminRepository: { findById: vi.fn() },
}));

import { companyAdminRepository } from '../../repositories/companyAdminRepository.js';
import { userAdminRepository } from '../../repositories/userAdminRepository.js';
import { listUsers } from '../userAdminController.js';

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

describe('listUsers', () => {
  it('joins each user with its company name, deduping lookups per company', async () => {
    vi.mocked(userAdminRepository.list).mockResolvedValue({
      items: [
        {
          id: 'u1',
          email: 'a@x.no',
          name: 'A',
          companyId: 'company-1',
          role: 'owner',
          status: 'active',
        },
        {
          id: 'u2',
          email: 'b@x.no',
          name: 'B',
          companyId: 'company-1',
          role: 'employee',
          status: 'active',
        },
      ],
      total: 2,
    });
    vi.mocked(companyAdminRepository.findById).mockResolvedValue({
      id: 'company-1',
      name: 'Glow Studio',
      slug: 'glow-studio',
      status: 'active',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
      createdAt: new Date(),
    });

    const result = await invokeHandler(listUsers, buildReq());

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      const body = result.body as { data: { users: { companyName: string }[] } };
      expect(body.data.users[0]?.companyName).toBe('Glow Studio');
      expect(body.data.users[1]?.companyName).toBe('Glow Studio');
    }
    // Deduped: two users, same company -> ONE lookup.
    expect(companyAdminRepository.findById).toHaveBeenCalledTimes(1);
  });

  it('reports null companyName for an orphaned companyId', async () => {
    vi.mocked(userAdminRepository.list).mockResolvedValue({
      items: [
        {
          id: 'u1',
          email: 'a@x.no',
          name: 'A',
          companyId: 'ghost-company',
          role: 'owner',
          status: 'active',
        },
      ],
      total: 1,
    });
    vi.mocked(companyAdminRepository.findById).mockResolvedValue(null);

    const result = await invokeHandler(listUsers, buildReq());

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      const body = result.body as { data: { users: { companyName: string | null }[] } };
      expect(body.data.users[0]?.companyName).toBeNull();
    }
  });
});
