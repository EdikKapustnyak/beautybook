import { describe, expect, it } from 'vitest';

import {
  createFailingSmsProvider,
  createInMemorySmsProvider,
} from '../../../shared/sms/__tests__/inMemorySmsProvider.js';
import { createNotificationService } from '../notificationService.js';
import { createInMemoryNotificationRepo } from './inMemoryNotificationPorts.js';

const COMPANY_ID = 'company-1';

function buildService() {
  const notificationRepo = createInMemoryNotificationRepo();
  const smsProvider = createInMemorySmsProvider();
  const service = createNotificationService({ notificationRepo, smsProvider });
  return { service, notificationRepo, smsProvider };
}

const baseNotification = {
  type: 'booking_confirmation' as const,
  recipient: '+4791234567',
  body: 'Your booking is confirmed for tomorrow at 10:00.',
  dedupeKey: 'booking-1:booking_confirmation',
  scheduledAt: new Date(),
};

describe('notificationService.enqueue — idempotent by dedupeKey', () => {
  it('creates a new record for a new dedupeKey', async () => {
    const { service } = buildService();
    const record = await service.enqueue(COMPANY_ID, baseNotification);
    expect(record.status).toBe('pending');
  });

  it('DUPLICATE JOB: enqueuing the same dedupeKey twice returns the SAME record, not a new one', async () => {
    const { service } = buildService();
    const first = await service.enqueue(COMPANY_ID, baseNotification);
    const second = await service.enqueue(COMPANY_ID, baseNotification);

    expect(second.id).toBe(first.id);
  });
});

describe('notificationService.send', () => {
  it('sends via the SMS provider and marks the record sent', async () => {
    const { service, smsProvider } = buildService();
    const record = await service.enqueue(COMPANY_ID, baseNotification);

    const result = await service.send(record.id);

    expect(result).toEqual({ sent: true, skipped: false });
    expect(smsProvider.sent).toHaveLength(1);
    expect(smsProvider.sent[0]?.to).toBe(baseNotification.recipient);
  });

  it('DUPLICATE PROVIDER CALLBACK / DUPLICATE JOB: sending the same notification twice only actually calls the provider once', async () => {
    const { service, smsProvider } = buildService();
    const record = await service.enqueue(COMPANY_ID, baseNotification);

    const first = await service.send(record.id);
    const second = await service.send(record.id);

    expect(first).toEqual({ sent: true, skipped: false });
    expect(second).toEqual({ sent: false, skipped: true });
    expect(smsProvider.sent).toHaveLength(1);
  });

  it('CONCURRENT SEND: only one of several simultaneous send attempts actually reaches the provider', async () => {
    const { service, smsProvider } = buildService();
    const record = await service.enqueue(COMPANY_ID, baseNotification);

    const results = await Promise.allSettled([
      service.send(record.id),
      service.send(record.id),
      service.send(record.id),
    ]);

    const sentResults = results.filter((r) => r.status === 'fulfilled' && r.value.sent === true);
    expect(sentResults).toHaveLength(1);
    expect(smsProvider.sent).toHaveLength(1);
  });

  it('RETRY: a failed send can be retried and eventually succeeds', async () => {
    const notificationRepo = createInMemoryNotificationRepo();
    const failingService = createNotificationService({
      notificationRepo,
      smsProvider: createFailingSmsProvider(),
    });
    const record = await failingService.enqueue(COMPANY_ID, baseNotification);

    await expect(failingService.send(record.id)).rejects.toThrow('SMS provider unavailable');

    const afterFailure = await notificationRepo.findById(record.id);
    expect(afterFailure?.status).toBe('failed');

    const healthySmsProvider = createInMemorySmsProvider();
    const retryService = createNotificationService({
      notificationRepo,
      smsProvider: healthySmsProvider,
    });
    const retryResult = await retryService.send(record.id);

    expect(retryResult).toEqual({ sent: true, skipped: false });
    expect(healthySmsProvider.sent).toHaveLength(1);
  });

  it('does not retry forever — stops being claimable once maxAttempts is exhausted', async () => {
    const notificationRepo = createInMemoryNotificationRepo();
    const record = await notificationRepo.findOrCreate(COMPANY_ID, {
      ...baseNotification,
      dedupeKey: 'booking-2:booking_confirmation',
    });
    await notificationRepo.claimForSending(record.id);
    await notificationRepo.markFailed(record.id, 'attempt 1 failed');
    await notificationRepo.claimForSending(record.id);
    await notificationRepo.markFailed(record.id, 'attempt 2 failed');
    await notificationRepo.claimForSending(record.id);
    await notificationRepo.markFailed(record.id, 'attempt 3 failed');

    const service = createNotificationService({
      notificationRepo,
      smsProvider: createInMemorySmsProvider(),
    });
    const result = await service.send(record.id);

    expect(result).toEqual({ sent: false, skipped: true });
  });

  it('a nonexistent notification id is a safe no-op, not a crash', async () => {
    const { service } = buildService();
    const result = await service.send('does-not-exist');
    expect(result).toEqual({ sent: false, skipped: true });
  });
});
