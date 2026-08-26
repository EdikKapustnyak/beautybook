// apps/backend/src/admin/controllers/userAdminController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { companyAdminRepository } from '../repositories/companyAdminRepository.js';
import { userAdminRepository } from '../repositories/userAdminRepository.js';
import { listUsersQuerySchema } from '../validation/userAdminSchemas.js';

export const listUsers = asyncHandler(async (req, res) => {
  const query = parseOrThrow(listUsersQuerySchema, req.query);
  const { items, total } = await userAdminRepository.list(query);

  // Batch company-name lookup, deduped by companyId, bounded by the
  // page (max 100 — paginationQuerySchema's own cap), never the full
  // company table.
  const uniqueCompanyIds = [...new Set(items.map((u) => u.companyId))];
  const companyNameById = new Map<string, string>();
  await Promise.all(
    uniqueCompanyIds.map(async (companyId) => {
      const company = await companyAdminRepository.findById(companyId);
      if (company) companyNameById.set(companyId, company.name);
    }),
  );

  const users = items.map((user) => ({
    ...user,
    companyName: companyNameById.get(user.companyId) ?? null,
  }));

  res.status(200).json({
    success: true,
    data: { users, pagination: { page: query.page, limit: query.limit, total } },
  });
});
