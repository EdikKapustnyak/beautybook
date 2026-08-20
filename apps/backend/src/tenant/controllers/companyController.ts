import { UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { companyService } from '../services/companyService.instance.js';
import { updateCompanySchema } from '../validation/companySchemas.js';

export const getCompany = asyncHandler(async (req, res) => {
  if (!req.tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const company = await companyService.getCompany(req.tenantAuth.companyId);
  res.status(200).json({ success: true, data: { company } });
});

export const updateCompany = asyncHandler(async (req, res) => {
  if (!req.tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const input = parseOrThrow(updateCompanySchema, req.body);
  // companyId is ALWAYS taken from the verified auth context, never from
  // the request body/params — see beautybook-security-measures.md §4.
  const company = await companyService.updateCompany(req.tenantAuth.companyId, input);
  res.status(200).json({ success: true, data: { company } });
});
