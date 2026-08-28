import { describe, expect, it } from 'vitest';

import { createTicketSchema, updateTicketSchema } from '../supportTicketSchemas.js';

describe('createTicketSchema', () => {
  it('accepts a minimal valid ticket', () => {
    const result = createTicketSchema.safeParse({
      subject: 'Cannot log in',
      description: 'Getting an error.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing subject', () => {
    const result = createTicketSchema.safeParse({ description: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid companyId format', () => {
    const result = createTicketSchema.safeParse({
      subject: 'X',
      description: 'Y',
      companyId: 'not-an-id',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority', () => {
    const result = createTicketSchema.safeParse({
      subject: 'X',
      description: 'Y',
      priority: 'critical',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = createTicketSchema.safeParse({
      subject: 'X',
      description: 'Y',
      status: 'resolved',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTicketSchema', () => {
  it('accepts a status-only update', () => {
    expect(updateTicketSchema.safeParse({ status: 'resolved' }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(updateTicketSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});
