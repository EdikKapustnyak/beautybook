import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import type { SmsProviderPort } from './smsProviderPort.js';

/**
 * Logs to stdout instead of sending a real SMS — the default provider so
 * local dev/CI never needs a Twilio account. Message CONTENT is only ever
 * logged in development (it may contain an OTP code) — see
 * security-measures.md §13. In any other environment this still "sends"
 * (returns a fake provider id) without printing the body, so accidentally
 * leaving `SMS_PROVIDER=console` set in staging doesn't leak OTP codes to
 * logs either.
 */
export const consoleSmsProvider: SmsProviderPort = {
  async sendSms(to, body) {
    const providerMessageId = `console-${randomUUID()}`;
    if (env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console -- dev-only, deliberate
      console.info(`[dev-only] SMS to ${to}: ${body} (id=${providerMessageId})`);
    }
    return { providerMessageId };
  },
};
