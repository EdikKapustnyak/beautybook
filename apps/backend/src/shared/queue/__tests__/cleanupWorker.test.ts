// apps/backend/src/shared/queue/__tests__/cleanupWorker.test.ts
//
// bullmq's Worker/Queue are entirely mocked here — constructing a real
// Worker opens a live Redis connection (same reasoning as queues.ts's
// lazy-Proxy comment for Queue), which this sandbox/CI environment
// doesn't have. What's actually under test: that the processor function
// wired into the Worker calls bookingAttachmentService's cleanup logic,
// and that the repeatable-job registration calls
// cleanupQueue.upsertJobScheduler with the right, idempotent shape.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function (
    this: { __processor: () => Promise<void>; close: () => void },
    _queueName: string,
    processor: () => Promise<void>,
  ) {
    this.__processor = processor;
    this.close = vi.fn();
  }),
}));
vi.mock('../../../tenant/services/bookingAttachmentService.instance.js', () => ({
  bookingAttachmentService: { cleanupExpiredAttachments: vi.fn() },
}));
vi.mock('../queues.js', () => ({
  cleanupQueue: { upsertJobScheduler: vi.fn() },
  QUEUE_NAMES: { cleanup: 'cleanup' },
}));
vi.mock('../redisConnection.js', () => ({
  redisConnection: {},
}));

import { Worker } from 'bullmq';
import { bookingAttachmentService } from '../../../tenant/services/bookingAttachmentService.instance.js';
import { cleanupQueue } from '../queues.js';
import { registerCleanupRepeatableJob, startCleanupWorker } from '../cleanupWorker.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startCleanupWorker', () => {
  it("wires a Worker on the 'cleanup' queue whose processor calls cleanupExpiredAttachments", async () => {
    vi.mocked(bookingAttachmentService.cleanupExpiredAttachments).mockResolvedValue({
      deletedCount: 3,
      failedCount: 0,
    });

    const worker = startCleanupWorker() as unknown as { __processor: () => Promise<void> };

    expect(Worker).toHaveBeenCalledWith('cleanup', expect.any(Function), expect.any(Object));
    await worker.__processor();
    expect(bookingAttachmentService.cleanupExpiredAttachments).toHaveBeenCalledTimes(1);
  });
});

describe('registerCleanupRepeatableJob', () => {
  it('registers an idempotent repeatable job via upsertJobScheduler (never a plain .add — that would duplicate on every restart)', async () => {
    await registerCleanupRepeatableJob();

    expect(cleanupQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'cleanup-expired-attachments-repeat',
      expect.objectContaining({ every: expect.any(Number) }),
      expect.objectContaining({ name: 'cleanup-expired-attachments' }),
    );
  });

  it('is safe to call more than once (upsert semantics, not additive)', async () => {
    await registerCleanupRepeatableJob();
    await registerCleanupRepeatableJob();

    expect(cleanupQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    const [firstCallArgs, secondCallArgs] = vi.mocked(cleanupQueue.upsertJobScheduler).mock.calls;
    expect(firstCallArgs?.[0]).toBe(secondCallArgs?.[0]); // same jobSchedulerId both times
  });
});
