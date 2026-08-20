import { isValidObjectId } from 'mongoose';

import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { customerRepository } from '../repositories/customerRepository.js';
import { listBookingsQuerySchema } from '../validation/bookingSchemas.js';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../validation/customerSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export const createCustomer = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const input = parseOrThrow(createCustomerSchema, req.body);

  try {
    const customer = await customerRepository.createInCompany(companyId, input);
    res.status(201).json({ success: true, data: { customer } });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError('A customer with that phone number already exists.');
    }
    throw error;
  }
});

export const listCustomers = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const query = parseOrThrow(listCustomersQuerySchema, req.query);

  const { items, total } = await customerRepository.listInCompany(companyId, query);
  res.status(200).json({
    success: true,
    data: { customers: items, pagination: { page: query.page, limit: query.limit, total } },
  });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid customer id.');
  }

  const customer = await customerRepository.findByIdInCompany(id, companyId);
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }
  res.status(200).json({ success: true, data: { customer } });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid customer id.');
  }

  const input = parseOrThrow(updateCustomerSchema, req.body);

  try {
    const customer = await customerRepository.updateInCompany(id, companyId, input);
    if (!customer) {
      throw new NotFoundError('Customer not found.');
    }
    res.status(200).json({ success: true, data: { customer } });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ConflictError('A customer with that phone number already exists.');
    }
    throw error;
  }
});

export const anonymizeCustomer = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid customer id.');
  }

  const customer = await customerRepository.anonymizeInCompany(id, companyId);
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }
  res.status(200).json({ success: true, data: { customer } });
});

export const getCustomerBookings = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const id = requireParam(req.params.id, 'id');

  if (!isValidObjectId(id)) {
    throw new ValidationError('Invalid customer id.');
  }

  const customer = await customerRepository.findByIdInCompany(id, companyId);
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  const query = parseOrThrow(listBookingsQuerySchema, req.query);
  const { items, total } = await bookingRepository.listInCompany(companyId, {
    ...query,
    customerId: id,
  });

  res.status(200).json({
    success: true,
    data: { bookings: items, pagination: { page: query.page, limit: query.limit, total } },
  });
});
