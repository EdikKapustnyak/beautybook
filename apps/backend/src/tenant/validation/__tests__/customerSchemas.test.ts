import { describe, expect, it } from 'vitest';

import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../customerSchemas.js';

describe('createCustomerSchema', () => {
  const validCustomer = { name: 'Kari Nordmann', phone: '+4791234567' };

  it('accepts a minimal valid customer', () => {
    expect(createCustomerSchema.safeParse(validCustomer).success).toBe(true);
  });

  it('accepts tags, notes, and priority', () => {
    const result = createCustomerSchema.safeParse({
      ...validCustomer,
      tags: ['VIP', 'prefers-morning'],
      notes: 'Allergic to acetone',
      priority: 80,
    });
    expect(result.success).toBe(true);
  });

  it('rejects HTML in notes', () => {
    const result = createCustomerSchema.safeParse({
      ...validCustomer,
      notes: '<script>alert(1)</script>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a priority above 100', () => {
    const result = createCustomerSchema.safeParse({ ...validCustomer, priority: 150 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative priority', () => {
    const result = createCustomerSchema.safeParse({ ...validCustomer, priority: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects mass-assignment attempts (companyId, totalBookings)', () => {
    const result = createCustomerSchema.safeParse({
      ...validCustomer,
      companyId: 'someone-elses-company',
      totalBookings: 9999,
    });
    expect(result.success).toBe(false);
  });

  it('rejects too many tags', () => {
    const result = createCustomerSchema.safeParse({
      ...validCustomer,
      tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateCustomerSchema', () => {
  it('accepts a partial update', () => {
    expect(updateCustomerSchema.safeParse({ priority: 50 }).success).toBe(true);
  });

  it('rejects an empty update', () => {
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
  });
});

describe('listCustomersQuerySchema', () => {
  it('accepts a normal search term', () => {
    const result = listCustomersQuerySchema.safeParse({ search: 'Kari' });
    expect(result.success).toBe(true);
  });

  it('rejects an overly long search term (defense in depth against abuse)', () => {
    const result = listCustomersQuerySchema.safeParse({ search: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts a regex-metacharacter-heavy search term (escaped downstream, not rejected here)', () => {
    // The schema itself doesn't need to reject these — escapeRegExp() in
    // customerRepository.ts is what neutralizes them before querying.
    const result = listCustomersQuerySchema.safeParse({ search: '.*(a+)+$' });
    expect(result.success).toBe(true);
  });

  it('respects the shared pagination bounds (max limit)', () => {
    const result = listCustomersQuerySchema.safeParse({ limit: 10_000 });
    expect(result.success).toBe(false);
  });
});
