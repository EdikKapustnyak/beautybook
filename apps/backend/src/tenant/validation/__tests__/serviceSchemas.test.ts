import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { createServiceSchema, updateServiceSchema } from '../serviceSchemas.js';

const validService = {
  name: 'Manicure',
  price: 500,
  currency: 'nok',
  durationMinutes: 60,
};

describe('createServiceSchema', () => {
  it('accepts a valid service and uppercases the currency', () => {
    const result = createServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('NOK');
    }
  });

  it('rejects a negative price', () => {
    const result = createServiceSchema.safeParse({ ...validService, price: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects a zero price', () => {
    const result = createServiceSchema.safeParse({ ...validService, price: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a price with more than 2 decimal places', () => {
    const result = createServiceSchema.safeParse({ ...validService, price: 499.999 });
    expect(result.success).toBe(false);
  });

  it('rejects zero duration', () => {
    const result = createServiceSchema.safeParse({ ...validService, durationMinutes: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects excessive duration', () => {
    const result = createServiceSchema.safeParse({ ...validService, durationMinutes: 10_000 });
    expect(result.success).toBe(false);
  });

  it('rejects HTML in the description', () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      description: '<script>alert(1)</script>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid employee id in employeeIds', () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      employeeIds: ['not-a-valid-object-id'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts well-formed employeeIds', () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      employeeIds: [String(new Types.ObjectId())],
    });
    expect(result.success).toBe(true);
  });

  it('rejects mass-assignment attempts (companyId, _id)', () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      companyId: 'someone-elses-company',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateServiceSchema', () => {
  it('accepts a partial update', () => {
    const result = updateServiceSchema.safeParse({ price: 600 });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update body', () => {
    const result = updateServiceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('still rejects unknown fields after .partial()', () => {
    const result = updateServiceSchema.safeParse({ subscriptionId: 'sub_forged' });
    expect(result.success).toBe(false);
  });

  it('still validates bounds on partial fields', () => {
    const result = updateServiceSchema.safeParse({ price: -1 });
    expect(result.success).toBe(false);
  });
});
