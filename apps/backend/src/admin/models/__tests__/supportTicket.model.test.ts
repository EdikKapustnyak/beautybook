import { describe, expect, it } from 'vitest';

import { SupportTicketModel } from '../supportTicket.model.js';

function buildValid(overrides: Record<string, unknown> = {}) {
  return new SupportTicketModel({
    subject: 'Cannot log in',
    description: 'I get an error when trying to log in.',
    ...overrides,
  });
}

describe('SupportTicketModel validation', () => {
  it('accepts a well-formed ticket', () => {
    const doc = buildValid();
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults priority to medium and status to open', () => {
    const doc = buildValid();
    expect(doc.priority).toBe('medium');
    expect(doc.status).toBe('open');
  });

  it('rejects a missing subject', () => {
    const doc = buildValid({ subject: undefined });
    expect(doc.validateSync()?.errors.subject).toBeDefined();
  });

  it('rejects a missing description', () => {
    const doc = buildValid({ description: undefined });
    expect(doc.validateSync()?.errors.description).toBeDefined();
  });

  it('rejects an invalid priority', () => {
    const doc = buildValid({ priority: 'critical' });
    expect(doc.validateSync()?.errors.priority).toBeDefined();
  });

  it('rejects an invalid status', () => {
    const doc = buildValid({ status: 'archived' });
    expect(doc.validateSync()?.errors.status).toBeDefined();
  });

  it('allows companyId/requesterEmail/requesterName/assignedAdminUserId to be omitted', () => {
    const doc = buildValid();
    expect(doc.validateSync()).toBeUndefined();
  });
});
