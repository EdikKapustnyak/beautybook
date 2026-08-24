import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { signAccessToken } from '../../../shared/security/tokens.js';
import { createTokenVersionRevocationStore } from '../../../shared/security/tokenVersionRevocation.js';
import { tenantAuthConfig } from '../../config.js';
import type { TenantUserRole } from '../../models/user.model.js';
import { createRequireTenantAuth, requireTenantRole } from '../requireTenantAuth.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as Request;
}

function buildRes(): Response {
  return {} as Response;
}

function signToken(payload: {
  sub: string;
  companyId: string;
  role: TenantUserRole;
  tokenVersion?: number;
}): string {
  return signAccessToken(payload, tenantAuthConfig.accessTokenSecret, 900);
}

/**
 * `createRequireTenantAuth` returns the RAW async function (not wrapped
 * in asyncHandler) specifically so it can be awaited directly here — see
 * the doc comment on createRequireTenantAuth in requireTenantAuth.ts for
 * why the asyncHandler-wrapped version can't be unit-tested this way.
 */
function createInMemoryStore() {
  const data = new Map<string, string>();
  return createTokenVersionRevocationStore({
    async set(key, value) {
      data.set(key, value);
      return 'OK';
    },
    async get(key) {
      return data.get(key) ?? null;
    },
  });
}

describe('requireTenantAuth', () => {
  const store = createInMemoryStore();
  const requireTenantAuth = createRequireTenantAuth(store);

  it('rejects a request with no Authorization header (anonymous)', async () => {
    const req = buildReq();
    const next = vi.fn();

    await expect(requireTenantAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/authentication is required/i),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header (not "Bearer ...")', async () => {
    const req = buildReq({ headers: { authorization: 'Basic abc123' } });
    const next = vi.fn();

    await expect(requireTenantAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/authentication is required/i),
    });
  });

  it('rejects an invalid/garbage token', async () => {
    const req = buildReq({ headers: { authorization: 'Bearer not-a-real-jwt' } });
    const next = vi.fn();

    await expect(requireTenantAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid or expired/i),
    });
  });

  it('rejects a token signed with a different secret (e.g. an admin token)', async () => {
    const forgedToken = signAccessToken(
      { sub: 'user-1', companyId: 'company-1', role: 'owner' },
      'a-completely-different-secret-not-tenant-32ch',
      900,
    );
    const req = buildReq({ headers: { authorization: `Bearer ${forgedToken}` } });
    const next = vi.fn();

    await expect(requireTenantAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid or expired/i),
    });
  });

  it('rejects an expired token', async () => {
    const expiredToken = signAccessToken(
      { sub: 'user-1', companyId: 'company-1', role: 'owner' },
      tenantAuthConfig.accessTokenSecret,
      -1,
    );
    const req = buildReq({ headers: { authorization: `Bearer ${expiredToken}` } });
    const next = vi.fn();

    await expect(requireTenantAuth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid or expired/i),
    });
  });

  it('attaches req.tenantAuth and calls next() for a valid token', async () => {
    const token = signToken({ sub: 'user-1', companyId: 'company-1', role: 'employee' });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();

    await requireTenantAuth(req, buildRes(), next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantAuth).toEqual({ userId: 'user-1', companyId: 'company-1', role: 'employee' });
  });

  it('treats a token with no tokenVersion claim as version 0 (pre-migration token)', async () => {
    const token = signToken({ sub: 'user-legacy', companyId: 'company-1', role: 'owner' });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();

    await requireTenantAuth(req, buildRes(), next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantAuth?.userId).toBe('user-legacy');
  });

  it('rejects a token whose tokenVersion is below the revoked minimum', async () => {
    const revokingStore = createInMemoryStore();
    const auth = createRequireTenantAuth(revokingStore);

    await revokingStore.revoke('token-version:tenant:user-2', 3, 900);

    const token = signToken({
      sub: 'user-2',
      companyId: 'company-1',
      role: 'admin',
      tokenVersion: 2,
    });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();

    await expect(auth(req, buildRes(), next as NextFunction)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid or expired/i),
    });
    expect(req.tenantAuth).toBeUndefined();
  });

  it('allows a token whose tokenVersion meets the revoked minimum', async () => {
    const revokingStore = createInMemoryStore();
    const auth = createRequireTenantAuth(revokingStore);

    await revokingStore.revoke('token-version:tenant:user-3', 3, 900);

    const token = signToken({
      sub: 'user-3',
      companyId: 'company-1',
      role: 'admin',
      tokenVersion: 3,
    });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();

    await auth(req, buildRes(), next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantAuth?.userId).toBe('user-3');
  });

  it('does not confuse a revocation record for a different user', async () => {
    const revokingStore = createInMemoryStore();
    const auth = createRequireTenantAuth(revokingStore);

    await revokingStore.revoke('token-version:tenant:user-revoked', 5, 900);

    const token = signToken({ sub: 'user-unaffected', companyId: 'company-1', role: 'employee' });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();

    await auth(req, buildRes(), next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireTenantRole', () => {
  const roles: TenantUserRole[] = ['owner', 'admin', 'manager', 'employee'];

  it('rejects when req.tenantAuth is missing (requireTenantAuth was not run first)', () => {
    const req = buildReq();
    const next = vi.fn();
    const gate = requireTenantRole('owner');

    expect(() => gate(req, buildRes(), next as NextFunction)).toThrow(
      /authentication is required/i,
    );
  });

  it.each(roles)('allows role "%s" when it is in the allowlist', (role) => {
    const req = buildReq({ tenantAuth: { userId: 'u1', companyId: 'c1', role } });
    const next = vi.fn();
    const gate = requireTenantRole(...roles);

    gate(req, buildRes(), next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects employee for an owner/admin-only route (RBAC matrix: company update)', () => {
    const req = buildReq({ tenantAuth: { userId: 'u1', companyId: 'c1', role: 'employee' } });
    const next = vi.fn();
    const gate = requireTenantRole('owner', 'admin');

    expect(() => gate(req, buildRes(), next as NextFunction)).toThrow(/permission/i);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects manager for an owner/admin-only route', () => {
    const req = buildReq({ tenantAuth: { userId: 'u1', companyId: 'c1', role: 'manager' } });
    const next = vi.fn();
    const gate = requireTenantRole('owner', 'admin');

    expect(() => gate(req, buildRes(), next as NextFunction)).toThrow(/permission/i);
  });

  it('allows admin for an owner/admin-only route', () => {
    const req = buildReq({ tenantAuth: { userId: 'u1', companyId: 'c1', role: 'admin' } });
    const next = vi.fn();
    const gate = requireTenantRole('owner', 'admin');

    gate(req, buildRes(), next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows owner for an owner/admin-only route', () => {
    const req = buildReq({ tenantAuth: { userId: 'u1', companyId: 'c1', role: 'owner' } });
    const next = vi.fn();
    const gate = requireTenantRole('owner', 'admin');

    gate(req, buildRes(), next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('never trusts a role claimed anywhere other than req.tenantAuth (e.g. req.body.role)', () => {
    const req = buildReq({
      tenantAuth: { userId: 'u1', companyId: 'c1', role: 'employee' },
      body: { role: 'owner' },
    } as Partial<Request>);
    const next = vi.fn();
    const gate = requireTenantRole('owner', 'admin');

    expect(() => gate(req, buildRes(), next as NextFunction)).toThrow(/permission/i);
  });
});
