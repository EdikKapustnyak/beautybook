// apps/backend/src/admin/repositories/__tests__/companyAdminRepository.test.ts
//
// Same reasoning as companyExistsAdapter.test.ts: registers a minimal,
// LOCAL 'Company' model under the shared Mongoose registry key rather
// than importing the real tenant/models/company.model.ts (which would
// itself violate the boundary this file's subject exists to respect).

import mongoose, { Schema } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  if (!mongoose.models.Company) {
    mongoose.model(
      'Company',
      new Schema({
        name: String,
        slug: String,
        status: String,
        timezone: String,
        currency: String,
        createdAt: Date,
      }),
    );
  }
});

const FAKE_COMPANY_DOC = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Glow Studio',
  slug: 'glow-studio',
  status: 'active',
  timezone: 'Europe/Oslo',
  currency: 'NOK',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('companyAdminRepository.list', () => {
  it('paginates and maps documents to AdminCompanyRecord shape', async () => {
    const CompanyModel = mongoose.model('Company');
    const execFind = vi.fn(async () => [FAKE_COMPANY_DOC]);
    const findSpy = vi.spyOn(CompanyModel, 'find').mockReturnValue({
      sort: () => ({
        skip: (skip: number) => ({
          limit: (limit: number) => {
            expect(skip).toBe(20); // page 3, limit 10
            expect(limit).toBe(10);
            return { exec: execFind };
          },
        }),
      }),
    } as unknown as ReturnType<typeof CompanyModel.find>);
    const countSpy = vi
      .spyOn(CompanyModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 25 } as ReturnType<typeof CompanyModel.countDocuments>);

    const { companyAdminRepository } = await import('../companyAdminRepository.js');
    const result = await companyAdminRepository.list({ page: 3, limit: 10 });

    expect(result.total).toBe(25);
    expect(result.items).toEqual([
      {
        id: String(FAKE_COMPANY_DOC._id),
        name: 'Glow Studio',
        slug: 'glow-studio',
        status: 'active',
        timezone: 'Europe/Oslo',
        currency: 'NOK',
        createdAt: FAKE_COMPANY_DOC.createdAt,
      },
    ]);

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('filters by status when provided', async () => {
    const CompanyModel = mongoose.model('Company');
    const findSpy = vi.spyOn(CompanyModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof CompanyModel.find>);
    const countSpy = vi
      .spyOn(CompanyModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<typeof CompanyModel.countDocuments>);

    const { companyAdminRepository } = await import('../companyAdminRepository.js');
    await companyAdminRepository.list({ page: 1, limit: 20, status: 'suspended' });

    expect(findSpy).toHaveBeenCalledWith({ status: 'suspended' });

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});

describe('companyAdminRepository.findById', () => {
  it('returns the mapped record when found', async () => {
    const CompanyModel = mongoose.model('Company');
    const findByIdSpy = vi
      .spyOn(CompanyModel, 'findById')
      .mockReturnValue({ exec: async () => FAKE_COMPANY_DOC } as ReturnType<
        typeof CompanyModel.findById
      >);

    const { companyAdminRepository } = await import('../companyAdminRepository.js');
    const result = await companyAdminRepository.findById(String(FAKE_COMPANY_DOC._id));

    expect(result?.name).toBe('Glow Studio');
    findByIdSpy.mockRestore();
  });

  it('returns null when not found', async () => {
    const CompanyModel = mongoose.model('Company');
    const findByIdSpy = vi
      .spyOn(CompanyModel, 'findById')
      .mockReturnValue({ exec: async () => null } as ReturnType<typeof CompanyModel.findById>);

    const { companyAdminRepository } = await import('../companyAdminRepository.js');
    const result = await companyAdminRepository.findById('does-not-exist');

    expect(result).toBeNull();
    findByIdSpy.mockRestore();
  });
});

describe('companyAdminRepository.updateStatus', () => {
  it('writes $set: { status } via findByIdAndUpdate', async () => {
    const CompanyModel = mongoose.model('Company');
    const suspended = { ...FAKE_COMPANY_DOC, status: 'suspended' };
    const updateSpy = vi
      .spyOn(CompanyModel, 'findByIdAndUpdate')
      .mockReturnValue({ exec: async () => suspended } as ReturnType<
        typeof CompanyModel.findByIdAndUpdate
      >);

    const { companyAdminRepository } = await import('../companyAdminRepository.js');
    const result = await companyAdminRepository.updateStatus(
      String(FAKE_COMPANY_DOC._id),
      'suspended',
    );

    expect(updateSpy).toHaveBeenCalledWith(
      String(FAKE_COMPANY_DOC._id),
      { $set: { status: 'suspended' } },
      { new: true },
    );
    expect(result?.status).toBe('suspended');
    updateSpy.mockRestore();
  });
});
