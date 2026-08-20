import twilio from 'twilio';

import { env } from '../../config/env.js';
import type { SmsProviderPort } from './smsProviderPort.js';

function getClient(): twilio.Twilio {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    // env.ts already enforces these are set when SMS_PROVIDER=twilio —
    // this is just a type-narrowing guard for TypeScript.
    throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN missing).');
  }
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

export const twilioSmsProvider: SmsProviderPort = {
  async sendSms(to, body) {
    if (!env.TWILIO_FROM_NUMBER) {
      throw new Error('TWILIO_FROM_NUMBER is not configured.');
    }
    const message = await getClient().messages.create({
      to,
      from: env.TWILIO_FROM_NUMBER,
      body,
    });
    return { providerMessageId: message.sid };
  },
};
