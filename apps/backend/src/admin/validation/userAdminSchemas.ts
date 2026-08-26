// apps/backend/src/admin/validation/userAdminSchemas.ts

import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});
