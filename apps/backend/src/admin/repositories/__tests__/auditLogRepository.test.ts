import { describe, expect, it, vi } from 'vitest';

import { AuditLogModel } from '../../models/auditLog.model.js';
import { auditLogRepository } from '../auditLogRepository.js';

describe('auditLogRepository.record', () => {
  it('creates a row with createdAt set', async () => {
    const createSpy = vi
      .spyOn(AuditLogModel, 'create')
      .mockResolvedValue({ adminUserId: 'admin-1' } as never);

    await auditLogRepository.record({
      adminUserId: 'admin-1',
      action: 'company.status_changed',
      targetType: 'company',
      targetId: 'company-1',
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'company.status_changed',
        createdAt: expect.any(Date),
      }),
    );
    createSpy.mockRestore();
  });
});

describe('auditLogRepository.list', () => {
  it('paginates with skip/limit and applies filters', async () => {
    const execFind = vi.fn(async () => []);
    const findSpy = vi.spyOn(AuditLogModel, 'find').mockReturnValue({
      sort: () => ({
        skip: (skip: number) => ({
          limit: (limit: number) => {
            expect(skip).toBe(20);
            expect(limit).toBe(10);
            return { exec: execFind };
          },
        }),
      }),
    } as unknown as ReturnType<typeof AuditLogModel.find>);
    const countSpy = vi
      .spyOn(AuditLogModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 45 } as ReturnType<typeof AuditLogModel.countDocuments>);

    const result = await auditLogRepository.list(
      { action: 'company.status_changed' },
      { page: 3, limit: 10 },
    );

    expect(findSpy).toHaveBeenCalledWith({ action: 'company.status_changed' });
    expect(result).toEqual({ items: [], total: 45 });

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('applies no filter when none provided', async () => {
    const findSpy = vi.spyOn(AuditLogModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof AuditLogModel.find>);
    const countSpy = vi
      .spyOn(AuditLogModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<typeof AuditLogModel.countDocuments>);

    await auditLogRepository.list({}, { page: 1, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith({});

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});
