// apps/backend/src/tenant/controllers/__tests__/teamController.test.ts
//
// Unit tests for the team-management controller — closes HANDOFF_2.md §4
// item 2. Follows the same invokeHandler/vi.mock testing approach as
// publicController.test.ts: these are plain `asyncHandler(...)` exports,
// not factories, so a handler's own side-effect (res.json/next(err)) is
// what resolves the test, not the handler's own returned promise.

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/userRepository.js', () => ({
  userRepository: {
    listInCompany: vi.fn(),
    findByIdInCompany: vi.fn(),
  },
}));
vi.mock('../../services/authService.instance.js', () => ({
  authService: { updateUserRoleOrStatus: vi.fn() },
}));

import { userRepository } from '../../repositories/userRepository.js';
import { authService } from '../../services/authService.instance.js';
import { listTeamMembers, updateTeamMemberRoleOrStatus } from '../teamController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    tenantAuth: { userId: 'caller-1', companyId: 'company-1', role: 'owner' },
    ...overrides,
  } as unknown as Request;
}

/** Same resolution strategy as publicController.test.ts's invokeHandler. */
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

const ADMIN_TARGET = {
  id: '507f1f77bcf86cd799439011',
  companyId: 'company-1',
  email: 'target@example.com',
  name: 'Target User',
  role: 'admin',
  status: 'active',
};

const OWNER_TARGET = { ...ADMIN_TARGET, id: '507f1f77bcf86cd799439022', role: 'owner' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTeamMembers', () => {
  it("returns the paginated team list for the caller's own company", async () => {
    vi.mocked(userRepository.listInCompany).mockResolvedValue({
      items: [ADMIN_TARGET] as never,
      total: 1,
    });

    const result = await invokeHandler(
      listTeamMembers,
      buildReq({ query: { page: '1', limit: '20' } }),
    );

    expect('error' in result).toBe(false);
    expect(userRepository.listInCompany).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });
});

describe('updateTeamMemberRoleOrStatus', () => {
  it('rejects changing your own role/status', async () => {
    const callerId = '507f1f77bcf86cd799439001';
    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({
        params: { id: callerId },
        body: { role: 'manager' },
        tenantAuth: { userId: callerId, companyId: 'company-1', role: 'owner' },
      }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as Error).message).toMatch(/cannot change your own/i);
    }
    expect(authService.updateUserRoleOrStatus).not.toHaveBeenCalled();
  });

  it('rejects an invalid id format without touching the repository', async () => {
    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({ params: { id: 'not-an-id' }, body: { role: 'manager' } }),
    );

    expect('error' in result).toBe(true);
    expect(userRepository.findByIdInCompany).not.toHaveBeenCalled();
  });

  it("returns 404 for a target that does not exist in the caller's company", async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(null);

    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({
        params: { id: '507f1f77bcf86cd799439099' },
        body: { role: 'manager' },
      }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
    expect(authService.updateUserRoleOrStatus).not.toHaveBeenCalled();
  });

  it('an admin caller cannot modify an owner-role target', async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(OWNER_TARGET as never);

    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({
        params: { id: OWNER_TARGET.id },
        body: { status: 'disabled' },
        tenantAuth: { userId: 'caller-1', companyId: 'company-1', role: 'admin' },
      }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('FORBIDDEN');
    }
    expect(authService.updateUserRoleOrStatus).not.toHaveBeenCalled();
  });

  it('an admin caller cannot promote anyone to owner', async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(ADMIN_TARGET as never);

    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({
        params: { id: ADMIN_TARGET.id },
        body: { role: 'owner' },
        tenantAuth: { userId: 'caller-1', companyId: 'company-1', role: 'admin' },
      }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('FORBIDDEN');
    }
    expect(authService.updateUserRoleOrStatus).not.toHaveBeenCalled();
  });

  it('an owner caller CAN modify an owner-role target', async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(OWNER_TARGET as never);
    vi.mocked(authService.updateUserRoleOrStatus).mockResolvedValue({
      ...OWNER_TARGET,
      status: 'disabled',
    } as never);

    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({
        params: { id: OWNER_TARGET.id },
        body: { status: 'disabled' },
        tenantAuth: { userId: 'caller-1', companyId: 'company-1', role: 'owner' },
      }),
    );

    expect('error' in result).toBe(false);
    expect(authService.updateUserRoleOrStatus).toHaveBeenCalledWith({
      userId: OWNER_TARGET.id,
      companyId: 'company-1',
      updates: { status: 'disabled' },
    });
  });

  it("happy path: owner changes an admin's role, gets 200 with the updated user", async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(ADMIN_TARGET as never);
    const updated = { ...ADMIN_TARGET, role: 'manager' };
    vi.mocked(authService.updateUserRoleOrStatus).mockResolvedValue(updated as never);

    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({ params: { id: ADMIN_TARGET.id }, body: { role: 'manager' } }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ success: true, data: { user: updated } });
    }
  });

  it('returns 404 if authService.updateUserRoleOrStatus races to null (target deleted concurrently)', async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(ADMIN_TARGET as never);
    vi.mocked(authService.updateUserRoleOrStatus).mockResolvedValue(null);

    const result = await invokeHandler(
      updateTeamMemberRoleOrStatus,
      buildReq({ params: { id: ADMIN_TARGET.id }, body: { role: 'manager' } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});
