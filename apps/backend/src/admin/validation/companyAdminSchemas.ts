// apps/backend/src/admin/validation/companyAdminSchemas.ts

import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';

export const companyIdParamSchema = z.object({
  companyId: z.string().refine(isValidObjectId, 'Must be a valid id.'),
});

export const listCompaniesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'active', 'suspended']).optional(),
});

export const updateCompanyStatusSchema = z
  .object({
    status: z.enum(['draft', 'active', 'suspended']),
  })
  .strict();
