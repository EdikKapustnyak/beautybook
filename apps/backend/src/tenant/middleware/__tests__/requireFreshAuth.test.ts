import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { TenantUserRole, TenantUserStatus } from '../../models/user.model.js';
import { createRequireFreshAuth, type FreshAuthUserLookup } from '../requireFreshAuth.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as Request;
}

function buildRes(): Response {
  return {} as Response;
}

function fakeLookup(
  users: Record<string, { role: TenantUserRole; status: TenantUserStatus }>,
): FreshAuthUserLookup {
  return {
    async findByIdInCompany(userId) {
      return users[userId] ?? null;
    },
  };
}

describe('requireFreshAuth', () => {
  it('rejects when req.tenantAuth is missing (requireTenantAuth was not run first)', async () => {
    const requireFreshAuth = createRequireFreshAuth(fakeLookup({}));
    const req = buildReq();
    const next = vi.fn();

    await expect(requireFreshAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/authentication is required/i),
    });
  });

  it('rejects when the user no longer exists in the database', async () => {
    const requireFreshAuth = createRequireFreshAuth(fakeLookup({}));
    const req = buildReq({ tenantAuth: { userId: 'gone', companyId: 'c1', role: 'owner' } });
    const next = vi.fn();

    await expect(requireFreshAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/no longer valid/i),
    });
  });

  it('rejects when the live status is no longer active', async () => {
    const requireFreshAuth = createRequireFreshAuth(
      fakeLookup({ 'user-1': { role: 'owner', status: 'disabled' } }),
    );
    const req = buildReq({ tenantAuth: { userId: 'user-1', companyId: 'c1', role: 'owner' } });
    const next = vi.fn();

    await expect(requireFreshAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/no longer valid/i),
    });
  });

  it('rejects when the live role no longer matches the token claim (downgrade), even though status is active', async () => {
    const requireFreshAuth = createRequireFreshAuth(
      fakeLookup({ 'user-1': { role: 'manager', status: 'active' } }),
    );
    // Token claims 'owner', but the DB now says 'manager' — this is
    // exactly the scenario mechanism 2 exists for.
    const req = buildReq({ tenantAuth: { userId: 'user-1', companyId: 'c1', role: 'owner' } });
    const next = vi.fn();

    await expect(requireFreshAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/permissions have changed/i),
    });
  });

  it('allows the request through when status is active and role matches the live record', async () => {
    const requireFreshAuth = createRequireFreshAuth(
      fakeLookup({ 'user-1': { role: 'owner', status: 'active' } }),
    );
    const req = buildReq({ tenantAuth: { userId: 'user-1', companyId: 'c1', role: 'owner' } });
    const next = vi.fn();

    await requireFreshAuth(req, buildRes(), next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it('scopes the lookup to the companyId from req.tenantAuth (never trusts a body/query companyId)', async () => {
    const lookup = fakeLookup({ 'user-1': { role: 'owner', status: 'active' } });
    const spy = vi.spyOn(lookup, 'findByIdInCompany');
    const requireFreshAuth = createRequireFreshAuth(lookup);
    const req = buildReq({
      tenantAuth: { userId: 'user-1', companyId: 'company-from-token', role: 'owner' },
      body: { companyId: 'attacker-supplied-company-id' },
    } as Partial<Request>);
    const next = vi.fn();

    await requireFreshAuth(req, buildRes(), next as NextFunction);

    expect(spy).toHaveBeenCalledWith('user-1', 'company-from-token');
  });
});
