// apps/backend/src/admin/controllers/companyAdminController.ts
//
// dev-tasks.md §22: Company list, Suspend company. Uses
// admin/repositories/companyAdminRepository.ts (never imports
// tenant/models/company.model.ts directly — see that file's header) and
// shared/billing/adapters.ts for the subscription-status join.

import { mongoSubscriptionRepositoryPort } from '../../shared/billing/adapters.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { companyAdminRepository } from '../repositories/companyAdminRepository.js';
import {
  companyIdParamSchema,
  listCompaniesQuerySchema,
  updateCompanyStatusSchema,
} from '../validation/companyAdminSchemas.js';

export const listCompanies = asyncHandler(async (req, res) => {
  const query = parseOrThrow(listCompaniesQuerySchema, req.query);
  const { items, total } = await companyAdminRepository.list(query);

  // Per-item subscription lookup — bounded by page size (max 100, same
  // cap as paginationQuerySchema everywhere else), not the full company
  // table. See metricsService.ts's own caveat: subscription.status here
  // is real (from the DB), only MRR amounts are estimates.
  const companies = await Promise.all(
    items.map(async (company) => {
      const subscription = await mongoSubscriptionRepositoryPort.findByCompanyId(company.id);
      return {
        ...company,
        subscriptionStatus: subscription?.status ?? null,
        subscriptionPlan: subscription?.plan ?? null,
      };
    }),
  );

  res.status(200).json({
    success: true,
    data: { companies, pagination: { page: query.page, limit: query.limit, total } },
  });
});

export const getCompany = asyncHandler(async (req, res) => {
  const { companyId } = parseOrThrow(companyIdParamSchema, req.params);
  const company = await companyAdminRepository.findById(companyId);
  if (!company) {
    throw new NotFoundError('Company not found.');
  }

  const subscription = await mongoSubscriptionRepositoryPort.findByCompanyId(companyId);
  res.status(200).json({ success: true, data: { company, subscription } });
});

export const updateCompanyStatus = asyncHandler(async (req, res) => {
  const { companyId } = parseOrThrow(companyIdParamSchema, req.params);
  const { status } = parseOrThrow(updateCompanyStatusSchema, req.body);

  const updated = await companyAdminRepository.updateStatus(companyId, status);
  if (!updated) {
    throw new NotFoundError('Company not found.');
  }

  // dev-tasks.md §27: company/subscription status changes are a listed
  // critical audit event — see admin/models/auditLog.model.ts's header.
  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'company.status_changed',
    targetType: 'company',
    targetId: companyId,
    metadata: { status },
  });

  res.status(200).json({ success: true, data: { company: updated } });
});
