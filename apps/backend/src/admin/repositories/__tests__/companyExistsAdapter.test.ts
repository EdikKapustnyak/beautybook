// apps/backend/src/admin/repositories/__tests__/companyExistsAdapter.test.ts
//
// Deliberately does NOT import tenant/models/company.model.ts — that
// would itself violate the exact eslint.config.js boundary
// companyExistsAdapter.ts exists to respect (see that file's header).
// Instead, this registers a minimal, LOCAL 'Company' model under the
// same Mongoose registry key the real one uses, which is exactly what
// the adapter is designed to work with — proving the retrieval-by-name
// mechanism itself, independent of the real schema's specific fields.

import mongoose, { Schema } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// A real MongoDB connection isn't available in this sandbox — `.exists()`
// needs SOME query execution path, so it's mocked at the Mongoose Model
// level rather than requiring a live database, matching how model-level
// tests elsewhere in this codebase (e.g. userRepository.test.ts) mock
// `Model.findOneAndUpdate`/etc. rather than hitting a real DB.
beforeAll(() => {
  if (!mongoose.models.Company) {
    mongoose.model('Company', new Schema({ name: String }));
  }
});

describe('companyExistsAdapter', () => {
  it('retrieves the ALREADY-REGISTERED "Company" model by name and queries it', async () => {
    const CompanyModel = mongoose.model('Company');
    const existsSpy = vi
      .spyOn(CompanyModel, 'exists')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never);

    const { companyExistsAdapter } = await import('../companyExistsAdapter.js');
    const result = await companyExistsAdapter.exists('507f1f77bcf86cd799439011');

    expect(result).toBe(true);
    expect(existsSpy).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439011' });
    existsSpy.mockRestore();
  });

  it('returns false when no matching document exists', async () => {
    const CompanyModel = mongoose.model('Company');
    const existsSpy = vi.spyOn(CompanyModel, 'exists').mockResolvedValue(null);

    const { companyExistsAdapter } = await import('../companyExistsAdapter.js');
    const result = await companyExistsAdapter.exists('507f1f77bcf86cd799439099');

    expect(result).toBe(false);
    existsSpy.mockRestore();
  });
});
