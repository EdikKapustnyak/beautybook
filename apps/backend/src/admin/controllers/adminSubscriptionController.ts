// apps/backend/src/admin/controllers/adminSubscriptionController.ts
//
// Platform-admin view of a single company's subscription, and the
// manual-grant action — see shared/billing/grantSubscription.ts's doc
// comment and shared/billing/subscription.model.ts's `grantedByAdmin`
// doc comment for the full design rationale (no Stripe involvement at
// all for a grant — comped accounts, partner deals, etc.). Uses
// shared/billing/, never tenant/, per eslint.config.js's
// no-restricted-imports rule — see shared/billing/types.ts's header.

import { isValidObjectId } from 'mongoose';

import { mongoSubscriptionRepositoryPort } from '../../shared/billing/adapters.js';
import { grantSubscription } from '../../shared/billing/grantSubscription.js';
import { ValidationError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { requireParam } from '../../shared/http/requireParam.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import { companyExistsAdapter } from '../repositories/companyExistsAdapter.js';
import { grantSubscriptionSchema } from '../validation/adminSubscriptionSchemas.js';

function requireValidCompanyId(raw: unknown): string {
  const companyId = requireParam(typeof raw === 'string' ? raw : undefined, 'companyId');
  if (!isValidObjectId(companyId)) {
    throw new ValidationError('Invalid company id.');
  }
  return companyId;
}

export const getCompanySubscription = asyncHandler(async (req, res) => {
  const companyId = requireValidCompanyId(req.params.companyId);
  const subscription = await mongoSubscriptionRepositoryPort.findByCompanyId(companyId);
  res.status(200).json({ success: true, data: { subscription } });
});

export const grantSubscriptionHandler = asyncHandler(async (req, res) => {
  const companyId = requireValidCompanyId(req.params.companyId);
  const { plan, reason } = parseOrThrow(grantSubscriptionSchema, req.body);

  const subscription = await grantSubscription(
    { subscriptionRepo: mongoSubscriptionRepositoryPort, companyExists: companyExistsAdapter },
    { companyId, plan, reason },
  );

  // dev-tasks.md §27: "subscription changes" is a listed critical audit
  // event — see admin/models/auditLog.model.ts's header for this
  // model's scope.
  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'subscription.granted',
    targetType: 'company',
    targetId: companyId,
    metadata: { plan, reason },
  });

  res.status(200).json({ success: true, data: { subscription } });
});
