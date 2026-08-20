import { randomUUID } from 'node:crypto';

import type { SmsProviderPort } from '../smsProviderPort.js';

export interface SentSms {
  to: string;
  body: string;
  providerMessageId: string;
}

export interface InMemorySmsProvider extends SmsProviderPort {
  sent: SentSms[];
}

export function createInMemorySmsProvider(): InMemorySmsProvider {
  const sent: SentSms[] = [];
  return {
    sent,
    async sendSms(to, body) {
      const providerMessageId = `fake-${randomUUID()}`;
      sent.push({ to, body, providerMessageId });
      return { providerMessageId };
    },
  };
}

/** A provider that always fails — for testing retry/failure-handling paths. */
export function createFailingSmsProvider(): SmsProviderPort {
  return {
    async sendSms() {
      throw new Error('SMS provider unavailable');
    },
  };
}
