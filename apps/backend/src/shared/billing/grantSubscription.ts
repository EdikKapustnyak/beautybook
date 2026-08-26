// apps/backend/src/shared/billing/grantSubscription.ts
//
// Platform-admin-only action (enforced at the admin route level — this
// function itself trusts its caller, same pattern as every *Service
// function elsewhere in this codebase). Directly sets a company's
// subscription to 'active' on the chosen plan WITHOUT any Stripe
// involvement — no Customer, no Checkout, no card. For comped accounts,
// partner deals, or any manually negotiated arrangement. See
// subscription.model.ts's `grantedByAdmin` doc comment for why this is
// tracked explicitly rather than inferred from a missing
// stripeCustomerId.
//
// Lives in shared/billing/ (not tenant/services/) specifically so
// admin/controllers/adminSubscriptionController.ts can call it —
// eslint.config.js forbids admin/** from importing tenant/** (see
// types.ts's header) — while still sharing the exact same
// SubscriptionRepositoryPort/records the tenant-side checkout flow uses,
// so a company's subscription is always ONE row regardless of which
// surface last touched it.

import { NotFoundError } from '../errors/AppError.js';
import type { CompanyExistsPort, SubscriptionRecord, SubscriptionRepositoryPort } from './types.js';
import type { SubscriptionPlan } from './subscription.model.js';

export async function grantSubscription(
  deps: { subscriptionRepo: SubscriptionRepositoryPort; companyExists: CompanyExistsPort },
  input: { companyId: string; plan: SubscriptionPlan; reason?: string },
): Promise<SubscriptionRecord> {
  const exists = await deps.companyExists.exists(input.companyId);
  if (!exists) {
    throw new NotFoundError('Company not found.');
  }

  const existing = await deps.subscriptionRepo.findByCompanyId(input.companyId);
  if (!existing) {
    return deps.subscriptionRepo.create({
      companyId: input.companyId,
      plan: input.plan,
      status: 'active',
      grantedByAdmin: true,
      grantedReason: input.reason,
    });
  }

  const updated = await deps.subscriptionRepo.updateByCompanyId(input.companyId, {
    plan: input.plan,
    status: 'active',
    grantedByAdmin: true,
    grantedReason: input.reason,
  });
  if (!updated) {
    // Existed on the read above but is gone now (deleted/moved
    // concurrently) — treat as not-found rather than a 500, same
    // defensive pattern as teamController.ts's race-condition guard.
    throw new NotFoundError('Company not found.');
  }
  return updated;
}
