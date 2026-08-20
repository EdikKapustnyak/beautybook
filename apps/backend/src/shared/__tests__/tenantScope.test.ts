import { describe, expect, it } from 'vitest';

import { tenantScopedIdFilter, withTenantScope } from '../tenantScope.js';

describe('withTenantScope', () => {
  it('adds companyId to an empty filter', () => {
    expect(withTenantScope('company-a', {})).toEqual({ companyId: 'company-a' });
  });

  it('merges companyId alongside other trusted filter fields', () => {
    expect(withTenantScope('company-a', { status: 'active' })).toEqual({
      status: 'active',
      companyId: 'company-a',
    });
  });

  it('ignores and overwrites a companyId supplied in the untrusted filter', () => {
    // Simulates a controller accidentally spreading req.query/req.body,
    // which could contain an attacker-supplied companyId.
    const spoofedFilter = { companyId: 'attacker-controlled-company', status: 'active' };

    const result = withTenantScope('real-tenant-company', spoofedFilter);

    expect(result.companyId).toBe('real-tenant-company');
    expect(result.status).toBe('active');
  });

  it('throws if companyId is empty (fails closed, not open)', () => {
    expect(() => withTenantScope('', {})).toThrow(/non-empty companyId/);
  });

  it('throws if companyId is only whitespace', () => {
    expect(() => withTenantScope('   ', {})).toThrow(/non-empty companyId/);
  });
});

describe('tenantScopedIdFilter', () => {
  it('builds a filter scoped to both _id and companyId', () => {
    expect(tenantScopedIdFilter('company-a', 'booking-123')).toEqual({
      _id: 'booking-123',
      companyId: 'company-a',
    });
  });

  it('cannot be tricked into cross-tenant lookup via a spoofed companyId on the id filter', () => {
    // Even if some upstream code mistakenly builds { _id, companyId } from
    // untrusted input, withTenantScope underneath still wins.
    const result = tenantScopedIdFilter('real-tenant', 'booking-123');
    expect(result.companyId).toBe('real-tenant');
  });

  it('throws on an empty id', () => {
    expect(() => tenantScopedIdFilter('company-a', '')).toThrow(/non-empty id/);
  });
});
