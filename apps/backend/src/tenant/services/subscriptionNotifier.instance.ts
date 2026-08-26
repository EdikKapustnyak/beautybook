// apps/backend/src/tenant/services/subscriptionNotifier.instance.ts

import { notificationsQueue } from '../../shared/queue/queues.js';
import type { NotificationJobData } from '../../shared/queue/notificationWorker.js';
import { userRepository } from '../repositories/userRepository.js';
import { subscriptionPaymentFailedMessage } from './messageTemplates.js';
import { notificationService } from './notificationService.instance.js';
import type { SubscriptionNotifierPort } from './subscriptionNotifier.js';

export const subscriptionNotifier: SubscriptionNotifierPort = {
  async notifyOwnerPaymentFailed({ companyId, companyName }) {
    // Best-effort, deliberately never throws — same reasoning as
    // publicController.ts's enqueuePublicBookingNotification: a
    // notification failure must never turn webhook processing (which
    // Stripe is waiting on for a 200) into an error response, and must
    // never block the actual subscription-state sync that already
    // happened before this is called.
    try {
      const owner = await userRepository.findOwnerInCompany(companyId);
      if (!owner?.phone) {
        // No owner phone on file — nothing this pipeline can do; not
        // logged as an error since it's a normal, expected state for a
        // company that never provided a phone number.
        return;
      }

      const notification = await notificationService.enqueue(companyId, {
        type: 'subscription_payment_failed',
        recipient: owner.phone,
        body: subscriptionPaymentFailedMessage({ companyName }),
        // Includes a timestamp: a NEW failure (this call happens once
        // per already-ledger-deduped Stripe event, see
        // subscriptionService.ts) must always get its own notification,
        // never be suppressed by an unrelated EARLIER failure's dedupeKey.
        dedupeKey: `${companyId}:subscription_payment_failed:${Date.now()}`,
        scheduledAt: new Date(),
      });
      const jobData: NotificationJobData = { notificationId: notification.id };
      await notificationsQueue.add('send-notification', jobData, {
        jobId: `send-${notification.id}`,
      });
    } catch (error) {
      console.error('Failed to notify owner of a failed subscription payment:', error);
    }
  },
};
