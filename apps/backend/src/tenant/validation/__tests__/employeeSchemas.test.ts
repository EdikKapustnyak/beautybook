import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { createEmployeeSchema, updateEmployeeSchema } from '../employeeSchemas.js';

describe('createEmployeeSchema', () => {
  it('accepts a minimal valid employee', () => {
    const result = createEmployeeSchema.safeParse({ name: 'Maria Hansen' });
    expect(result.success).toBe(true);
  });

  it('requires a name', () => {
    const result = createEmployeeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('lowercases the email', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      email: 'MARIA@EXAMPLE.COM',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('maria@example.com');
    }
  });

  it('rejects a malformed email', () => {
    const result = createEmployeeSchema.safeParse({ name: 'Maria', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid service id in serviceIds', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      serviceIds: ['not-a-valid-object-id'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts well-formed serviceIds', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      serviceIds: [String(new Types.ObjectId())],
    });
    expect(result.success).toBe(true);
  });

  it('rejects mass-assignment attempts (companyId, userId spoofing)', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      companyId: 'someone-elses-company',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid workingHours schedule', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      workingHours: {
        monday: [{ start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects overlapping working periods in workingHours', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      workingHours: {
        monday: [
          { start: '09:00', end: '13:00' },
          { start: '12:00', end: '18:00' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed time string in workingHours', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      workingHours: { monday: [{ start: '9am', end: '18:00' }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown weekday key in workingHours', () => {
    const result = createEmployeeSchema.safeParse({
      name: 'Maria',
      workingHours: { someday: [{ start: '09:00', end: '18:00' }] },
    });
    expect(result.success).toBe(false);
  });
});

describe('updateEmployeeSchema', () => {
  it('accepts a partial update', () => {
    const result = updateEmployeeSchema.safeParse({ active: false });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update body', () => {
    const result = updateEmployeeSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
