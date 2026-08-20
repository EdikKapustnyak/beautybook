import { beforeEach, describe, expect, it } from 'vitest';

import { hashOpaqueToken } from '../../../shared/security/tokens.js';
import { createInMemorySmsProvider } from '../../../shared/sms/__tests__/inMemorySmsProvider.js';
import { createOtpService } from '../otpService.js';
import { createInMemoryOtpRepo } from './inMemoryOtpPorts.js';

const COMPANY_ID = 'company-1';
const PHONE = '+4791234567';
const PURPOSE = 'booking_phone_verification' as const;

function buildService(overrides: { now?: () => Date } = {}) {
  const otpRepo = createInMemoryOtpRepo(overrides.now);
  const smsProvider = createInMemorySmsProvider();
  const service = createOtpService({
    otpRepo,
    smsProvider,
    ttlSeconds: 300,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
    now: overrides.now,
  });
  return { service, otpRepo, smsProvider };
}

function extractCode(body: string): string {
  const match = /\b(\d{6})\b/.exec(body);
  const code = match?.[1];
  if (!code) {
    throw new Error(`Could not find a 6-digit code in SMS body: ${body}`);
  }
  return code;
}

describe('otpService.requestOtp', () => {
  it('sends an SMS containing a 6-digit code', async () => {
    const { service, smsProvider } = buildService();
    await service.requestOtp(COMPANY_ID, PHONE, PURPOSE);

    expect(smsProvider.sent).toHaveLength(1);
    const [firstSms] = smsProvider.sent;
    expect(firstSms?.to).toBe(PHONE);
    expect(extractCode(firstSms?.body ?? '')).toMatch(/^\d{6}$/);
  });

  it('never stores the plaintext code — only its hash', async () => {
    const { service, otpRepo, smsProvider } = buildService();
    await service.requestOtp(COMPANY_ID, PHONE, PURPOSE);

    const code = extractCode(smsProvider.sent[0]?.body ?? '');
    const stored = await otpRepo.findLatestByPhone(COMPANY_ID, PHONE, PURPOSE);
    expect(stored?.codeHash).toBe(hashOpaqueToken(code));
    expect(stored?.codeHash).not.toBe(code);
  });

  it('enforces the resend cooldown — a second immediate request is rejected', async () => {
    const { service } = buildService();
    await service.requestOtp(COMPANY_ID, PHONE, PURPOSE);

    await expect(service.requestOtp(COMPANY_ID, PHONE, PURPOSE)).rejects.toMatchObject({
      code: 'OTP_RESEND_COOLDOWN',
    });
  });

  it('allows a resend once the cooldown has elapsed', async () => {
    let currentTime = new Date('2026-01-01T00:00:00.000Z');
    const { service, smsProvider } = buildService({ now: () => currentTime });

    await service.requestOtp(COMPANY_ID, PHONE, PURPOSE);
    currentTime = new Date(currentTime.getTime() + 61 * 1000);

    await service.requestOtp(COMPANY_ID, PHONE, PURPOSE);
    expect(smsProvider.sent).toHaveLength(2);
  });

  it('treats every phone number identically regardless of prior history (no enumeration branch)', async () => {
    const { service, smsProvider: smsA } = buildService();
    await service.requestOtp(COMPANY_ID, '+4799999999', PURPOSE);
    expect(smsA.sent).toHaveLength(1);
  });
});

describe('otpService.verifyOtp', () => {
  let service: ReturnType<typeof buildService>['service'];
  let otpRepo: ReturnType<typeof buildService>['otpRepo'];
  let code: string;

  beforeEach(async () => {
    const built = buildService();
    service = built.service;
    otpRepo = built.otpRepo;
    await service.requestOtp(COMPANY_ID, PHONE, PURPOSE);
    code = extractCode(built.smsProvider.sent[0]?.body ?? '');
  });

  it('succeeds with the correct code', async () => {
    await expect(service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code)).resolves.toBeUndefined();
  });

  it('rejects a wrong code with a generic error', async () => {
    const wrongCode = code === '000000' ? '111111' : '000000';
    await expect(service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, wrongCode)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      publicMessage: 'Invalid or expired code.',
    });
  });

  it('rejects reuse of an already-verified code (single-use)', async () => {
    await service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code);

    await expect(service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects an expired code', async () => {
    const expiredOtp = await otpRepo.create(COMPANY_ID, {
      phone: '+4788888888',
      purpose: PURPOSE,
      codeHash: hashOpaqueToken('123456'),
      expiresAt: new Date(Date.now() - 1000),
      maxAttempts: 5,
    });

    await expect(
      service.verifyOtp(COMPANY_ID, '+4788888888', PURPOSE, '123456'),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const stillUnverified = await otpRepo.findById(expiredOtp.id);
    expect(stillUnverified?.verifiedAt).toBeUndefined();
  });

  it('BRUTE FORCE: locks out after maxAttempts wrong guesses', async () => {
    const wrongCode = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      await expect(service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, wrongCode)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    }

    await expect(service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code)).rejects.toMatchObject({
      code: 'OTP_LOCKED',
    });
  });

  it('CONCURRENT VERIFICATION: only one of several simultaneous correct-code attempts succeeds', async () => {
    const results = await Promise.allSettled([
      service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code),
      service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code),
      service.verifyOtp(COMPANY_ID, PHONE, PURPOSE, code),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
  });

  it('rejects verification for an unknown phone number with the same generic error', async () => {
    await expect(service.verifyOtp(COMPANY_ID, '+4700000000', PURPOSE, code)).rejects.toMatchObject(
      { code: 'UNAUTHORIZED', publicMessage: 'Invalid or expired code.' },
    );
  });
});
