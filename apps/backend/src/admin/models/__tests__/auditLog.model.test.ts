import { describe, expect, it } from 'vitest';

import { AuditLogModel } from '../auditLog.model.js';

describe('AuditLogModel validation', () => {
  it('accepts a well-formed record', () => {
    const doc = new AuditLogModel({
      adminUserId: 'admin-1',
      action: 'company.status_changed',
      targetType: 'company',
      targetId: 'company-1',
      metadata: { status: 'suspended' },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults createdAt to now', () => {
    const before = Date.now();
    const doc = new AuditLogModel({
      adminUserId: 'admin-1',
      action: 'company.status_changed',
      targetType: 'company',
    });
    expect(doc.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rejects a missing adminUserId', () => {
    const doc = new AuditLogModel({ action: 'x', targetType: 'company' });
    expect(doc.validateSync()?.errors.adminUserId).toBeDefined();
  });

  it('rejects a missing action', () => {
    const doc = new AuditLogModel({ adminUserId: 'admin-1', targetType: 'company' });
    expect(doc.validateSync()?.errors.action).toBeDefined();
  });

  it('rejects a missing targetType', () => {
    const doc = new AuditLogModel({ adminUserId: 'admin-1', action: 'x' });
    expect(doc.validateSync()?.errors.targetType).toBeDefined();
  });

  it('allows targetId and metadata to be omitted', () => {
    const doc = new AuditLogModel({
      adminUserId: 'admin-1',
      action: 'platform_settings.updated',
      targetType: 'platform_settings',
    });
    expect(doc.validateSync()).toBeUndefined();
  });
});
