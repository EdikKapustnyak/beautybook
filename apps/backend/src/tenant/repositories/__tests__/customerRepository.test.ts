// apps/backend/src/tenant/repositories/__tests__/customerRepository.test.ts
//
// dev-tasks.md §12's own checklist for Customer CRM — this file closes
// the gap where escapeRegExp() itself was already thoroughly tested
// (shared/validation/__tests__/regexEscape.test.ts, including a ReDoS
// payload) but nothing proved the REPOSITORY actually calls it
// correctly, or that every method is genuinely tenant-scoped rather than
// trusting a bare `findById`/`find(filter)`. Checklist items covered
// here: cross-tenant search, regex injection, ReDoS, unauthorized
// customer access. "Huge query" (string length) and "pagination abuse"
// are Zod-schema concerns — see customerSchemas.test.ts
// (MAX_SEARCH_LENGTH) and shared/validation/pagination.ts's MAX_PAGE_SIZE
// — not re-tested here.

import { describe, expect, it, vi } from 'vitest';

import { CustomerModel } from '../../models/customer.model.js';
import { customerRepository } from '../customerRepository.js';

interface SearchFilterShape {
  $or: { name: { $regex: string } }[];
}

/** Extracts the $regex pattern the repository actually sent to Mongo.find(), routing through `any` deliberately — avoids TS narrowing the mocked call-args tuple to `[]` (a vitest/mongoose FilterQuery inference quirk unrelated to what this test is checking). */
function firstNameRegex(mockCalls: unknown[][]): string {
  const filterArg = mockCalls[0]?.[0] as unknown as SearchFilterShape;
  const entries: { name: { $regex: string } }[] = filterArg.$or;
  return entries[0]!.name.$regex;
}

describe('customerRepository.listInCompany — regex safety', () => {
  it('escapes regex metacharacters in the search term before querying Mongo', async () => {
    const findSpy = vi.spyOn(CustomerModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof CustomerModel.find>);
    const countSpy = vi
      .spyOn(CustomerModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<typeof CustomerModel.countDocuments>);

    // A classic regex-injection payload: unescaped, `.*` would match
    // every document; a real Mongo unique-index-style attack would try
    // something like this to enumerate the whole tenant's customer list
    // regardless of the actual search intent.
    await customerRepository.listInCompany('company-1', { page: 1, limit: 20, search: '.*' });

    const filterArg = firstNameRegex(findSpy.mock.calls);
    // The literal payload must NOT survive unescaped — `\.` and `\*`,
    // never a bare `.` or `*` that a Mongo regex would interpret specially.
    expect(filterArg).toBe('\\.\\*');
    expect(filterArg).not.toBe('.*');

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('escapes a ReDoS-shaped search payload rather than passing it through raw', async () => {
    const findSpy = vi.spyOn(CustomerModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof CustomerModel.find>);
    const countSpy = vi
      .spyOn(CustomerModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<typeof CustomerModel.countDocuments>);

    const redosPayload = '(a+)+$';
    await customerRepository.listInCompany('company-1', {
      page: 1,
      limit: 20,
      search: redosPayload,
    });

    const escapedPattern = firstNameRegex(findSpy.mock.calls);
    // Constructing a real RegExp from what the repository actually sent
    // to Mongo, and running it against a string that WOULD hang an
    // unescaped `(a+)+$` — proves the escaping survived the full
    // repository call, not just the standalone escapeRegExp() unit test.
    const regex = new RegExp(escapedPattern, 'i');
    const longInput = 'a'.repeat(50) + '!';
    const start = performance.now();
    regex.test(longInput);
    expect(performance.now() - start).toBeLessThan(50);

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('applies the tenant scope on every list call — companyId always in the filter, never spoofable', async () => {
    const findSpy = vi.spyOn(CustomerModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof CustomerModel.find>);
    const countSpy = vi
      .spyOn(CustomerModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<typeof CustomerModel.countDocuments>);

    await customerRepository.listInCompany('company-1', { page: 1, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1' }));

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});

describe('customerRepository — cross-tenant isolation (dev-tasks.md §4/§12)', () => {
  it('findByIdInCompany scopes by companyId, never a bare findById', async () => {
    const findOneSpy = vi
      .spyOn(CustomerModel, 'findOne')
      .mockReturnValue({ exec: async () => null } as ReturnType<typeof CustomerModel.findOne>);

    await customerRepository.findByIdInCompany('customer-1', 'company-1');

    expect(findOneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'customer-1', companyId: 'company-1' }),
    );
    findOneSpy.mockRestore();
  });

  it("updateInCompany scopes by companyId, so tenant B cannot update tenant A's customer", async () => {
    const updateSpy = vi
      .spyOn(CustomerModel, 'findOneAndUpdate')
      .mockReturnValue({ exec: async () => null } as ReturnType<
        typeof CustomerModel.findOneAndUpdate
      >);

    await customerRepository.updateInCompany('customer-1', 'company-B', { name: 'Hijacked' });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'customer-1', companyId: 'company-B' }),
      expect.anything(),
      expect.anything(),
    );
    updateSpy.mockRestore();
  });

  it('anonymizeInCompany scopes by companyId', async () => {
    const updateSpy = vi
      .spyOn(CustomerModel, 'findOneAndUpdate')
      .mockReturnValue({ exec: async () => null } as ReturnType<
        typeof CustomerModel.findOneAndUpdate
      >);

    await customerRepository.anonymizeInCompany('customer-1', 'company-B');

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'customer-1', companyId: 'company-B' }),
      expect.anything(),
      expect.anything(),
    );
    updateSpy.mockRestore();
  });

  it("a companyId key smuggled into the untrusted filter position is stripped, not honored (withTenantScope's own guarantee, exercised through the repository)", async () => {
    // listInCompany never accepts a raw filter object from the caller —
    // only structured `search`/`tag` options — so there's no code path
    // to smuggle a companyId through it in the first place. This test
    // documents that invariant rather than exercising a vulnerable path.
    const findSpy = vi.spyOn(CustomerModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof CustomerModel.find>);
    const countSpy = vi
      .spyOn(CustomerModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<typeof CustomerModel.countDocuments>);

    await customerRepository.listInCompany('company-1', {
      page: 1,
      limit: 20,
      // @ts-expect-error — ListCustomersOptions has no companyId field;
      // this proves the TYPE SYSTEM itself blocks the smuggling attempt,
      // not just a runtime check.
      companyId: 'attacker-company',
    });

    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1' }));

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});
