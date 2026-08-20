import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ServiceModel } from '../service.model.js';

function buildValidService(overrides: Record<string, unknown> = {}) {
  return new ServiceModel({
    companyId: new Types.ObjectId(),
    name: 'Manicure',
    price: 500,
    currency: 'NOK',
    durationMinutes: 60,
    ...overrides,
  });
}

describe('ServiceModel validation', () => {
  it('accepts a well-formed service', () => {
    const service = buildValidService();
    expect(service.validateSync()).toBeUndefined();
  });

  it('requires companyId', () => {
    const service = buildValidService({ companyId: undefined });
    expect(service.validateSync()?.errors.companyId).toBeDefined();
  });

  it('requires name', () => {
    const service = buildValidService({ name: undefined });
    expect(service.validateSync()?.errors.name).toBeDefined();
  });

  it('rejects a negative price', () => {
    const service = buildValidService({ price: -10 });
    expect(service.validateSync()?.errors.price).toBeDefined();
  });

  it('rejects a zero price', () => {
    const service = buildValidService({ price: 0 });
    expect(service.validateSync()?.errors.price).toBeDefined();
  });

  it('rejects a price with more than 2 decimal places', () => {
    const service = buildValidService({ price: 499.999 });
    expect(service.validateSync()?.errors.price).toBeDefined();
  });

  it('accepts a price with exactly 2 decimal places', () => {
    const service = buildValidService({ price: 499.99 });
    expect(service.validateSync()).toBeUndefined();
  });

  it('rejects an invalid currency code', () => {
    const service = buildValidService({ currency: 'NOKX' });
    expect(service.validateSync()?.errors.currency).toBeDefined();
  });

  it('rejects zero duration', () => {
    const service = buildValidService({ durationMinutes: 0 });
    expect(service.validateSync()?.errors.durationMinutes).toBeDefined();
  });

  it('rejects a non-integer duration', () => {
    const service = buildValidService({ durationMinutes: 45.5 });
    expect(service.validateSync()?.errors.durationMinutes).toBeDefined();
  });

  it('rejects an excessive duration (more than one working day)', () => {
    const service = buildValidService({ durationMinutes: 10_000 });
    expect(service.validateSync()?.errors.durationMinutes).toBeDefined();
  });

  it('rejects a negative buffer', () => {
    const service = buildValidService({ bufferMinutes: -5 });
    expect(service.validateSync()?.errors.bufferMinutes).toBeDefined();
  });

  it('defaults bufferMinutes to 0', () => {
    const service = buildValidService();
    expect(service.bufferMinutes).toBe(0);
  });

  it('defaults active to true', () => {
    const service = buildValidService();
    expect(service.active).toBe(true);
  });

  it('defaults employeeIds to an empty array', () => {
    const service = buildValidService();
    expect(service.employeeIds).toEqual([]);
  });
});
