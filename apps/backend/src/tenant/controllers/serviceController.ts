import { isValidObjectId } from 'mongoose';

import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { serviceRepository } from '../repositories/serviceRepository.js';
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from '../validation/serviceSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

async function assertEmployeeIdsBelongToCompany(
  employeeIds: string[] | undefined,
  companyId: string,
): Promise<void> {
  if (!employeeIds || employeeIds.length === 0) {
    return;
  }
  const invalidIds = await employeeRepository.findInvalidIdsForCompany(employeeIds, companyId);
  if (invalidIds.length > 0) {
    // Deliberately doesn't say WHY they're invalid (nonexistent vs.
    // belonging to another tenant) — same message either way.
    throw new ValidationError(`One or more employeeIds are invalid: ${invalidIds.join(', ')}`);
  }
}

export const createService = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const input = parseOrThrow(createServiceSchema, req.body);

  await assertEmployeeIdsBelongToCompany(input.employeeIds, companyId);

  const service = await serviceRepository.createInCompany(companyId, input);
  res.status(201).json({ success: true, data: { service } });
});

export const listServices = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(listServicesQuerySchema, req.query);

  const { items, total } = await serviceRepository.listInCompany(companyId, query);
  res.status(200).json({
    success: true,
    data: { services: items, pagination: { page: query.page, limit: query.limit, total } },
  });
});

export const getService = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid service id.');
  }

  const service = await serviceRepository.findByIdInCompany(id, companyId);
  if (!service) {
    throw new NotFoundError('Service not found.');
  }
  res.status(200).json({ success: true, data: { service } });
});

export const updateService = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid service id.');
  }

  const input = parseOrThrow(updateServiceSchema, req.body);
  await assertEmployeeIdsBelongToCompany(input.employeeIds, companyId);

  const service = await serviceRepository.updateByIdInCompany(id, companyId, input);
  if (!service) {
    throw new NotFoundError('Service not found.');
  }
  res.status(200).json({ success: true, data: { service } });
});

export const deleteService = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid service id.');
  }

  const deleted = await serviceRepository.deleteByIdInCompany(id, companyId);
  if (!deleted) {
    throw new NotFoundError('Service not found.');
  }
  res.status(200).json({ success: true, data: {} });
});
