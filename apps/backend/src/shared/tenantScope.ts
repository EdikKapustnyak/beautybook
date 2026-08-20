/**
 * Tenant isolation is enforced HERE, once, rather than trusted to every
 * controller/repository call site individually. See
 * beautybook-security-measures.md §4: "companyId никогда не брать как
 * authority из body/query" and beautybook-development-tasks.md §4
 * ("Подмена companyId не работает").
 *
 * Every tenant-scoped Mongo query MUST go through `withTenantScope`.
 * A repository that calls `Model.find(req.query)` or `Model.findById(id)`
 * directly is a tenant-isolation bug — see docs/dependency-audit-notes.md
 * sibling doc `docs/security-review-checklist.md` (added when the security
 * audit stage runs) for the grep patterns used to catch this in CI.
 */

export type TenantId = string;

/**
 * Merges a caller-supplied Mongo filter with the authoritative companyId
 * that came from a *verified auth context* (never from req.body/req.query).
 *
 * Any `companyId` key present in the untrusted `filter` argument is
 * stripped and silently discarded — the authoritative value always wins.
 * This makes companyId spoofing a non-issue by construction rather than by
 * convention: even if a controller accidentally spreads `req.query` into
 * the filter, the tenant boundary still holds.
 */
export function withTenantScope<TFilter extends Record<string, unknown>>(
  companyId: TenantId,
  filter: TFilter = {} as TFilter,
): TFilter & { companyId: TenantId } {
  if (typeof companyId !== 'string' || companyId.trim().length === 0) {
    throw new Error(
      'withTenantScope() requires a non-empty companyId from a verified auth context.',
    );
  }

  const { companyId: _ignoredUntrustedCompanyId, ...safeFilter } = filter as Record<
    string,
    unknown
  > & { companyId?: unknown };

  return { ...safeFilter, companyId } as TFilter & { companyId: TenantId };
}

/**
 * Same guarantee as `withTenantScope`, specialised for "look up one
 * document by id within this tenant" — the most common and most
 * security-sensitive query shape (IDOR risk if companyId is dropped).
 */
export function tenantScopedIdFilter(
  companyId: TenantId,
  id: string,
): { _id: string; companyId: TenantId } {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('tenantScopedIdFilter() requires a non-empty id.');
  }
  return withTenantScope(companyId, { _id: id });
}
