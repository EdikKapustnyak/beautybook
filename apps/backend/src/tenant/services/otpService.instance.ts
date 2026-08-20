import { env } from '../../config/env.js';
import { smsProvider } from '../../shared/sms/smsProvider.instance.js';
import { mongoOtpRepositoryPort } from '../repositories/otpRepositoryAdapter.js';
import { createOtpService } from './otpService.js';

export const otpService = createOtpService({
  otpRepo: mongoOtpRepositoryPort,
  smsProvider,
  ttlSeconds: env.OTP_TTL_SECONDS,
  maxAttempts: env.OTP_MAX_ATTEMPTS,
  resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
});
