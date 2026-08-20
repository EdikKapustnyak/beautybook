import { env } from '../../config/env.js';
import { consoleSmsProvider } from './consoleSmsProvider.js';
import type { SmsProviderPort } from './smsProviderPort.js';
import { twilioSmsProvider } from './twilioSmsProvider.js';

export const smsProvider: SmsProviderPort =
  env.SMS_PROVIDER === 'twilio' ? twilioSmsProvider : consoleSmsProvider;
