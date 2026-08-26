// apps/backend/src/admin/repositories/__tests__/userAdminRepository.test.ts
//
// Same reasoning as companyAdminRepository.test.ts: registers a minimal,
// LOCAL 'TenantUser' model under the shared Mongoose registry key rather
// than importing tenant/models/user.model.ts.

import mongoose, { Schema } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  if (!mongoose.models.TenantUser) {
    mongoose.model(
      'TenantUser',
      new Schema({
        email: String,
        name: String,
        companyId: Schema.Types.ObjectId,
        role: String,
        status: String,
        lastLoginAt: Date,
      }),
    );
  }
});

const FAKE_USER_DOC = {
  _id: new mongoose.Types.ObjectId(),
  email: 'owner@glowstudio.no',
  name: 'Owner Ownerson',
  companyId: new mongoose.Types.ObjectId(),
  role: 'owner',
  status: 'active',
  lastLoginAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('userAdminRepository.list', () => {
  it('paginates and maps documents to AdminUserRecord shape', async () => {
    const TenantUserModel = mongoose.model('TenantUser');
    const findSpy = vi.spyOn(TenantUserModel, 'find').mockReturnValue({
      sort: () => ({
        skip: (skip: number) => ({
          limit: (limit: number) => {
            expect(skip).toBe(20);
            expect(limit).toBe(10);
            return { exec: async () => [FAKE_USER_DOC] };
          },
        }),
      }),
    } as unknown as ReturnType<typeof TenantUserModel.find>);
    const countSpy = vi
      .spyOn(TenantUserModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 8 } as ReturnType<
        typeof TenantUserModel.countDocuments
      >);

    const { userAdminRepository } = await import('../userAdminRepository.js');
    const result = await userAdminRepository.list({ page: 3, limit: 10 });

    expect(result.total).toBe(8);
    expect(result.items[0]).toMatchObject({
      email: 'owner@glowstudio.no',
      role: 'owner',
      status: 'active',
    });

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('builds a case-insensitive, anchored, regex-escaped search filter (no injection/ReDoS)', async () => {
    const TenantUserModel = mongoose.model('TenantUser');
    const findSpy = vi.spyOn(TenantUserModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof TenantUserModel.find>);
    const countSpy = vi
      .spyOn(TenantUserModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<
        typeof TenantUserModel.countDocuments
      >);

    const { userAdminRepository } = await import('../userAdminRepository.js');
    await userAdminRepository.list({ page: 1, limit: 20, search: 'a.(b+' });

    expect(findSpy).toHaveBeenCalledWith({
      email: { $regex: '^a\\.\\(b\\+', $options: 'i' },
    });

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('applies no filter when no search term is given', async () => {
    const TenantUserModel = mongoose.model('TenantUser');
    const findSpy = vi.spyOn(TenantUserModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof TenantUserModel.find>);
    const countSpy = vi
      .spyOn(TenantUserModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<
        typeof TenantUserModel.countDocuments
      >);

    const { userAdminRepository } = await import('../userAdminRepository.js');
    await userAdminRepository.list({ page: 1, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith({});

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});
