import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { EmployeeModel } from '../employee.model.js';

function buildValidEmployee(overrides: Record<string, unknown> = {}) {
  return new EmployeeModel({
    companyId: new Types.ObjectId(),
    name: 'Maria Hansen',
    ...overrides,
  });
}

describe('EmployeeModel validation', () => {
  it('accepts a well-formed employee with only required fields', () => {
    const employee = buildValidEmployee();
    expect(employee.validateSync()).toBeUndefined();
  });

  it('requires companyId', () => {
    const employee = buildValidEmployee({ companyId: undefined });
    expect(employee.validateSync()?.errors.companyId).toBeDefined();
  });

  it('requires name', () => {
    const employee = buildValidEmployee({ name: undefined });
    expect(employee.validateSync()?.errors.name).toBeDefined();
  });

  it('accepts a valid email', () => {
    const employee = buildValidEmployee({ email: 'maria@example.com' });
    expect(employee.validateSync()).toBeUndefined();
  });

  it('rejects a malformed email', () => {
    const employee = buildValidEmployee({ email: 'not-an-email' });
    expect(employee.validateSync()?.errors.email).toBeDefined();
  });

  it('accepts a valid phone number', () => {
    const employee = buildValidEmployee({ phone: '+47 912 34 567' });
    expect(employee.validateSync()).toBeUndefined();
  });

  it('rejects a malformed phone number', () => {
    const employee = buildValidEmployee({ phone: 'call me maybe' });
    expect(employee.validateSync()?.errors.phone).toBeDefined();
  });

  it('defaults active to true', () => {
    const employee = buildValidEmployee();
    expect(employee.active).toBe(true);
  });

  it('defaults serviceIds to an empty array', () => {
    const employee = buildValidEmployee();
    expect(employee.serviceIds).toEqual([]);
  });

  it('accepts an optional userId link to a login account', () => {
    const employee = buildValidEmployee({ userId: new Types.ObjectId() });
    expect(employee.validateSync()).toBeUndefined();
  });

  it('defaults workingHours to an empty schedule (no day has any periods)', () => {
    const employee = buildValidEmployee();
    expect(employee.workingHours.monday).toBeUndefined();
    expect(employee.workingHours.sunday).toBeUndefined();
  });

  it('accepts a valid weekly schedule', () => {
    const employee = buildValidEmployee({
      workingHours: {
        monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }],
        tuesday: [{ start: '09:00', end: '18:00' }],
      },
    });
    expect(employee.validateSync()).toBeUndefined();
  });

  it('rejects overlapping working periods in workingHours', () => {
    const employee = buildValidEmployee({
      workingHours: {
        monday: [
          { start: '09:00', end: '13:00' },
          { start: '12:00', end: '18:00' },
        ],
      },
    });
    expect(employee.validateSync()?.errors.workingHours).toBeDefined();
  });

  it('rejects a break outside its working period in workingHours', () => {
    const employee = buildValidEmployee({
      workingHours: {
        monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '08:00', end: '08:30' }] }],
      },
    });
    expect(employee.validateSync()?.errors.workingHours).toBeDefined();
  });

  it('rejects a midnight-crossing period in workingHours', () => {
    const employee = buildValidEmployee({
      workingHours: { monday: [{ start: '22:00', end: '02:00' }] },
    });
    expect(employee.validateSync()?.errors.workingHours).toBeDefined();
  });
});
