import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { CustomerModel } from '../customer.model.js';

function buildValidCustomer(overrides: Record<string, unknown> = {}) {
  return new CustomerModel({
    companyId: new Types.ObjectId(),
    name: 'Kari Nordmann',
    phone: '+47 912 34 567',
    ...overrides,
  });
}

describe('CustomerModel validation', () => {
  it('accepts a well-formed customer', () => {
    const customer = buildValidCustomer();
    expect(customer.validateSync()).toBeUndefined();
  });

  it('requires companyId', () => {
    const customer = buildValidCustomer({ companyId: undefined });
    expect(customer.validateSync()?.errors.companyId).toBeDefined();
  });

  it('requires name', () => {
    const customer = buildValidCustomer({ name: undefined });
    expect(customer.validateSync()?.errors.name).toBeDefined();
  });

  it('requires phone', () => {
    const customer = buildValidCustomer({ phone: undefined });
    expect(customer.validateSync()?.errors.phone).toBeDefined();
  });

  it('rejects a malformed phone number', () => {
    const customer = buildValidCustomer({ phone: 'call me' });
    expect(customer.validateSync()?.errors.phone).toBeDefined();
  });

  it('accepts an optional email', () => {
    const customer = buildValidCustomer({ email: 'kari@example.com' });
    expect(customer.validateSync()).toBeUndefined();
  });

  it('rejects a malformed email', () => {
    const customer = buildValidCustomer({ email: 'not-an-email' });
    expect(customer.validateSync()?.errors.email).toBeDefined();
  });

  it('defaults tags to an empty array', () => {
    const customer = buildValidCustomer();
    expect(customer.tags).toEqual([]);
  });

  it('accepts a list of tags', () => {
    const customer = buildValidCustomer({ tags: ['VIP', 'prefers-morning'] });
    expect(customer.validateSync()).toBeUndefined();
  });

  it('rejects too many tags', () => {
    const customer = buildValidCustomer({ tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`) });
    expect(customer.validateSync()?.errors.tags).toBeDefined();
  });

  it('rejects an overly long tag', () => {
    const customer = buildValidCustomer({ tags: ['a'.repeat(41)] });
    expect(customer.validateSync()?.errors.tags).toBeDefined();
  });

  it('defaults priority to 0', () => {
    const customer = buildValidCustomer();
    expect(customer.priority).toBe(0);
  });

  it('rejects a negative priority', () => {
    const customer = buildValidCustomer({ priority: -1 });
    expect(customer.validateSync()?.errors.priority).toBeDefined();
  });

  it('rejects a priority above 100', () => {
    const customer = buildValidCustomer({ priority: 101 });
    expect(customer.validateSync()?.errors.priority).toBeDefined();
  });

  it('rejects a non-integer priority', () => {
    const customer = buildValidCustomer({ priority: 50.5 });
    expect(customer.validateSync()?.errors.priority).toBeDefined();
  });

  it('defaults totalBookings to 0', () => {
    const customer = buildValidCustomer();
    expect(customer.totalBookings).toBe(0);
  });

  it('rejects a negative totalBookings', () => {
    const customer = buildValidCustomer({ totalBookings: -1 });
    expect(customer.validateSync()?.errors.totalBookings).toBeDefined();
  });

  it('accepts optional notes and lastBookingAt', () => {
    const customer = buildValidCustomer({
      notes: 'Prefers gel manicures',
      lastBookingAt: new Date(),
    });
    expect(customer.validateSync()).toBeUndefined();
  });
});
