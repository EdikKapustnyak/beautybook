// apps/backend/src/tenant/repositories/stripeWebhookEventRepository.ts
//
// Idempotency ledger CRUD — see stripeWebhookEvent.model.ts's header for
// why this is its own tiny collection.

import { StripeWebhookEventModel } from '../models/stripeWebhookEvent.model.js';

export const stripeWebhookEventRepository = {
  /**
   * Attempts to atomically record this event id. Returns `true` if this
   * is the first time we've seen it (caller should process the event),
   * or `false` if it's a replay (caller should skip processing but still
   * respond 200 — Stripe must not be told to keep retrying a webhook
   * we've already handled). Relies on the unique index on
   * `stripeEventId`, not a read-then-write check, to close the race
   * where Stripe redelivers the same event twice in quick succession —
   * same reasoning as SlotLock's reserve-before-create pattern
   * (bookingService.ts) applied to webhook idempotency instead of
   * booking slots.
   */
  async recordIfNew(stripeEventId: string, type: string): Promise<boolean> {
    try {
      await StripeWebhookEventModel.create({ stripeEventId, type });
      return true;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return false;
      }
      throw err;
    }
  },
};

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}
