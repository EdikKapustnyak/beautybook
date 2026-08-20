import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { signAccessToken } from '../../../shared/security/tokens.js';
import { tenantAuthConfig } from '../../config.js';
import type { TenantUserRole } from '../../models/user.model.js';
import { requireTenantAuth, requireTenantRole } from '../requireTenantAuth.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as Request;
}

function buildRes(): Response {
  return {} as Response;
}

function signToken(payload: { sub: string; companyId: string; role: TenantUserRole }): string {
  return signAccessToken(payload, tenantAuthConfig.accessTokenSecret, 900);
}

describe('requireTenantAuth', () => {
  it('rejects a request with no Authorization header (anonymous)', () => {
    const req = buildReq();
    const next = vi.fn();

    expect(() => requireTenantAuth(req, buildRes(), next as NextFunction)).toThrow(
      /authentication is required/i,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header (not "Bearer ...")', () => {
    const req = buildReq({ headers: { authorization: 'Basic abc123' } });
    const next = vi.fn();

    expect(() => requireTenantAuth(req, buildRes(), next as NextFunction)).toThrow(
      /authentication is required/i,
    );
  });

  it('rejects an invalid/garbage token', () => {
    const req = buildReq({ headers: { authorization: 'Bearer not-a-real-jwt' } });
    const next = vi.fn();

    expect(() => requireTenantAuth(req, buildRes(), next as NextFunction)).toThrow(
      /invalid or expired/i,
    );
  });

  it('rejects a token signed with a different secret (e.g. an admin token)', () => {
    const forgedToken = signAccessToken(
      { sub: 'user-1', companyId: 'company-1', role: 'owner' },
      'a-completely-different-secret-not-tenant-32ch',
      900,
    );
    const req = buildReq({ headers: { authorization: `Bearer ${forgedToken}` } });
    const next = vi.fn();

    expect(() => requireTenantAuth(req, buildRes(), next as NextFunction)).toThrow(
      /invalid or expired/i,
    );
  });

  it('rejects an expired token', () => {
    const expiredToken = signAccessToken(
      { sub: 'user-1', companyId: 'company-1', role: 'owner' },
      tenantAuthConfig.accessTokenSecret,
      -1,
    );
    const req = buildReq({ headers: { authorization: `Bearer ${expiredToken}` } });
    const next = vi.fn();

    expect(() => requireTenantAuth(req, buildRes(), next as NextFunction)).toThrow(
      /invalid or expired/i,
    );
  });

  it('attaches req.tenantAuth and calls next() for a valid token', () => {
    const token = signToken({ sub: 'user-1', companyId: 'company-1', role: 'employee' });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();

    requireTenantAuth(req, buildRes(), next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantAuth).toEqual({ userId: 'user-1', companyId: 'company-1', role: 'employee' });
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
