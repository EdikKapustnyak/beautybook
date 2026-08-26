// apps/backend/src/tenant/repositories/__tests__/employeeRepository.test.ts

import { describe, expect, it, vi } from 'vitest';

import { EmployeeModel } from '../../models/employee.model.js';
import { employeeRepository } from '../employeeRepository.js';

describe('employeeRepository.findByUserIdInCompany', () => {
  it('queries by userId, tenant-scoped by companyId', async () => {
    const execSpy = vi.fn(async () => ({ _id: 'employee-1' }));
    const findOneSpy = vi
      .spyOn(EmployeeModel, 'findOne')
      .mockReturnValue({ exec: execSpy } as unknown as ReturnType<typeof EmployeeModel.findOne>);

    const result = await employeeRepository.findByUserIdInCompany('user-1', 'company-1');

    expect(findOneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', companyId: 'company-1' }),
    );
    expect(result).toEqual({ _id: 'employee-1' });

    findOneSpy.mockRestore();
  });

  it('returns null for a user with no linked Employee roster entry', async () => {
    const findOneSpy = vi
      .spyOn(EmployeeModel, 'findOne')
      .mockReturnValue({ exec: async () => null } as unknown as ReturnType<
        typeof EmployeeModel.findOne
      >);

    const result = await employeeRepository.findByUserIdInCompany('user-2', 'company-1');

    expect(result).toBeNull();
    findOneSpy.mockRestore();
  });
});
