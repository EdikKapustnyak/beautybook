// apps/backend/src/tenant/services/subscriptionNotifier.ts
//
// Narrow port hiding "who to notify and how" from subscriptionService.ts
// — same DI-testability reasoning as StripeGatewayPort
// (shared/payments/stripeGateway.ts). subscriptionService.ts only knows
// it needs to notify SOMEONE about a failed payment; the real
// implementation (subscriptionNotifier.instance.ts) is the only place
// that knows this means "find the company owner, then send them an SMS".

export interface SubscriptionNotifierPort {
  notifyOwnerPaymentFailed(input: { companyId: string; companyName: string }): Promise<void>;
}
