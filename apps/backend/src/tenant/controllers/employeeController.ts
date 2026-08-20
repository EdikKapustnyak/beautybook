import { isValidObjectId } from 'mongoose';

import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { serviceRepository } from '../repositories/serviceRepository.js';
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from '../validation/employeeSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

async function assertServiceIdsBelongToCompany(
  serviceIds: string[] | undefined,
  companyId: string,
): Promise<void> {
  if (!serviceIds || serviceIds.length === 0) {
    return;
  }
  const invalidIds = await serviceRepository.findInvalidIdsForCompany(serviceIds, companyId);
  if (invalidIds.length > 0) {
    throw new ValidationError(`One or more serviceIds are invalid: ${invalidIds.join(', ')}`);
  }
}

export const createEmployee = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const input = parseOrThrow(createEmployeeSchema, req.body);

  await assertServiceIdsBelongToCompany(input.serviceIds, companyId);

  const employee = await employeeRepository.createInCompany(companyId, input);
  res.status(201).json({ success: true, data: { employee } });
});

export const listEmployees = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(listEmployeesQuerySchema, req.query);

  const { items, total } = await employeeRepository.listInCompany(companyId, query);
  res.status(200).json({
    success: true,
    data: { employees: items, pagination: { page: query.page, limit: query.limit, total } },
  });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid employee id.');
  }

  const employee = await employeeRepository.findByIdInCompany(id, companyId);
  if (!employee) {
    throw new NotFoundError('Employee not found.');
  }
  res.status(200).json({ success: true, data: { employee } });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid employee id.');
  }

  const input = parseOrThrow(updateEmployeeSchema, req.body);
  await assertServiceIdsBelongToCompany(input.serviceIds, companyId);

  const employee = await employeeRepository.updateByIdInCompany(id, companyId, input);
  if (!employee) {
    throw new NotFoundError('Employee not found.');
  }
  res.status(200).json({ success: true, data: { employee } });
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid employee id.');
  }

  const deleted = await employeeRepository.deleteByIdInCompany(id, companyId);
  if (!deleted) {
    throw new NotFoundError('Employee not found.');
  }
  res.status(200).json({ success: true, data: {} });
});
