import { Queue, type QueueOptions } from 'bullmq';

import { redisConnection } from './redisConnection.js';

export const QUEUE_NAMES = {
  notifications: 'notifications',
  reminders: 'reminders',
  cleanup: 'cleanup',
} as const;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60 }, // keep 7 days for observability, then GC
  removeOnFail: { age: 30 * 24 * 60 * 60 },
};

/**
 * Constructing a BullMQ `Queue` triggers an eager Redis connection
 * (BullMQ calls `.connect()` in its own bootstrap regardless of the
 * underlying ioredis client's `lazyConnect` option — verified directly in
 * BullMQ's `RedisConnection.init()`). Since these queues are imported at
 * module load time by controllers (which unit tests exercise via
 * `createApp()`, without ever actually enqueueing a job), naively
 * exporting `new Queue(...)` here means every test run tries to open a
 * real TCP connection to Redis, whether or not the test has anything to
 * do with queues.
 *
 * This Proxy defers the REAL `new Queue(...)` call until the first
 * property is actually accessed (i.e. the first `.add()`, `.remove()`,
 * etc.) — call sites like `notificationsQueue.add(...)` are completely
 * unaffected; only the timing of the underlying connection changes.
 */
function createLazyQueue(name: string, options: QueueOptions): Queue {
  let instance: Queue | undefined;
  const getInstance = (): Queue => {
    instance ??= new Queue(name, options);
    return instance;
  };

  return new Proxy({} as Queue, {
    get(_target, prop, receiver) {
      const real = getInstance();
      const value = Reflect.get(real, prop, receiver);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

export const notificationsQueue = createLazyQueue(QUEUE_NAMES.notifications, {
  connection: redisConnection,
  defaultJobOptions,
});

export const remindersQueue = createLazyQueue(QUEUE_NAMES.reminders, {
  connection: redisConnection,
  defaultJobOptions,
});

export const cleanupQueue = createLazyQueue(QUEUE_NAMES.cleanup, {
  connection: redisConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 }, // cleanup handles its own per-item retry, not job-level
});
