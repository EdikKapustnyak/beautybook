// apps/backend/src/tenant/controllers/subscriptionController.ts

import { NotFoundError, UnauthorizedError } from '../../shared/errors/AppError.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { parseOrThrow } from '../../shared/http/parseOrThrow.js';
import { userRepository } from '../repositories/userRepository.js';
import { subscriptionService } from '../services/subscriptionService.instance.js';
import { createCheckoutSessionSchema } from '../validation/subscriptionSchemas.js';

function requireAuth(tenantAuth: { userId: string; companyId: string } | undefined): {
  userId: string;
  companyId: string;
} {
  if (!tenantAuth) {
    throw new UnauthorizedError('Authentication is required.');
  }
  return tenantAuth;
}

export const getSubscription = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const subscription = await subscriptionService.getSubscription(companyId);
  res.status(200).json({ success: true, data: { subscription } });
});

export const createCheckoutSession = asyncHandler(async (req, res) => {
  const { userId, companyId } = requireAuth(req.tenantAuth);
  const { plan } = parseOrThrow(createCheckoutSessionSchema, req.body);

  const requester = await userRepository.findByIdInCompany(userId, companyId);
  if (!requester) {
    // Practically unreachable (requireTenantAuth already resolved this
    // exact user/company pair moments earlier) — treated as NotFound
    // rather than a 500 purely for defense in depth against a
    // concurrent account deletion mid-request.
    throw new NotFoundError('User not found.');
  }

  const { url } = await subscriptionService.createCheckoutSession({
    companyId,
    plan,
    requesterEmail: requester.email,
    requesterName: requester.name,
  });
  res.status(200).json({ success: true, data: { checkoutUrl: url } });
});

export const createBillingPortalSession = asyncHandler(async (req, res) => {
  const { companyId } = requireAuth(req.tenantAuth);
  const { url } = await subscriptionService.createBillingPortalSession(companyId);
  res.status(200).json({ success: true, data: { portalUrl: url } });
});
