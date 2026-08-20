import { isValidObjectId } from 'mongoose';

import { NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { blockedTimeRepository } from '../repositories/blockedTimeRepository.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import {
  createBlockedTimeSchema,
  listBlockedTimeQuerySchema,
} from '../validation/blockedTimeSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

export const createBlockedTime = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const input = parseOrThrow(createBlockedTimeSchema, req.body);

  if (input.employeeId) {
    const employee = await employeeRepository.findByIdInCompany(input.employeeId, companyId);
    if (!employee) {
      // Same generic message whether the id doesn't exist at all or
      // belongs to another tenant — see security-measures.md §4/§30.
      throw new ValidationError('employeeId is invalid.');
    }
  }

  const blockedTime = await blockedTimeRepository.createInCompany(companyId, input);
  res.status(201).json({ success: true, data: { blockedTime } });
});

export const listBlockedTime = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(listBlockedTimeQuerySchema, req.query);

  const { items, total } = await blockedTimeRepository.listInCompany(companyId, query);
  res.status(200).json({
    success: true,
    data: {
      blockedTimes: items,
      pagination: { page: query.page, limit: query.limit, total },
    },
  });
});

export const deleteBlockedTime = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid blocked-time id.');
  }

  const deleted = await blockedTimeRepository.deleteByIdInCompany(id, companyId);
  if (!deleted) {
    throw new NotFoundError('Blocked-time interval not found.');
  }
  res.status(200).json({ success: true, data: {} });
});
