// apps/backend/src/admin/controllers/discountCodeController.ts

import { mongoDiscountCodeRepositoryPort } from '../../shared/billing/adapters.js';
import { stripeGateway } from '../../shared/payments/stripeGateway.instance.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { auditLogRepository } from '../repositories/auditLogRepository.js';
import {
  codeParamSchema,
  createDiscountCodeSchema,
  setDiscountCodeActiveSchema,
} from '../validation/discountCodeSchemas.js';

export const listDiscountCodes = asyncHandler(async (_req, res) => {
  const codes = await mongoDiscountCodeRepositoryPort.list();
  res.status(200).json({ success: true, data: { codes } });
});

export const createDiscountCode = asyncHandler(async (req, res) => {
  const input = parseOrThrow(createDiscountCodeSchema, req.body);

  const existing = await mongoDiscountCodeRepositoryPort.findByCode(input.code);
  if (existing) {
    throw new ConflictError('A discount code with this code already exists.');
  }

  // Real Stripe backing, created here (not lazily at checkout) — see
  // discountCode.model.ts's header for why this differs from
  // PlanConfig's per-plan discount.
  const { stripeCouponId, stripePromotionCodeId } = await stripeGateway.createPromotionCode({
    code: input.code,
    percentOff: input.percentOff,
    maxRedemptions: input.maxRedemptions,
    expiresAt: input.expiresAt,
  });

  const created = await mongoDiscountCodeRepositoryPort.create({
    code: input.code,
    percentOff: input.percentOff,
    appliesToPlans: input.appliesToPlans,
    maxRedemptions: input.maxRedemptions,
    expiresAt: input.expiresAt,
    stripeCouponId,
    stripePromotionCodeId,
  });

  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: 'discount_code.created',
    targetType: 'discount_code',
    targetId: created.code,
    metadata: { percentOff: input.percentOff, appliesToPlans: input.appliesToPlans },
  });

  res.status(201).json({ success: true, data: { code: created } });
});

export const setDiscountCodeActive = asyncHandler(async (req, res) => {
  const { code } = parseOrThrow(codeParamSchema, req.params);
  const { active } = parseOrThrow(setDiscountCodeActiveSchema, req.body);

  const updated = await mongoDiscountCodeRepositoryPort.setActive(code, active);
  if (!updated) {
    throw new NotFoundError('Discount code not found.');
  }

  await auditLogRepository.record({
    adminUserId: req.adminAuth?.adminUserId ?? 'unknown',
    action: active ? 'discount_code.activated' : 'discount_code.deactivated',
    targetType: 'discount_code',
    targetId: updated.code,
  });

  res.status(200).json({ success: true, data: { code: updated } });
});
