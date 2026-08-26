// apps/backend/src/admin/controllers/subscriptionsOverviewController.ts

import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { paginationQuerySchema } from '../../shared/validation/pagination.js';
import {
  computeSubscriptionsKpis,
  listSubscriptionsOverview,
} from '../services/subscriptionsOverviewService.js';

export const getSubscriptionsOverview = asyncHandler(async (req, res) => {
  const query = parseOrThrow(paginationQuerySchema, req.query);
  const [kpis, { items, total }] = await Promise.all([
    computeSubscriptionsKpis(),
    listSubscriptionsOverview(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      kpis,
      subscriptions: items,
      pagination: { page: query.page, limit: query.limit, total },
    },
  });
});
