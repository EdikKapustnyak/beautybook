import { Redis } from 'ioredis';

import { env } from '../../config/env.js';

/**
 * `maxRetriesPerRequest: null` is required by BullMQ — without it, ioredis
 * gives up on commands during a Redis reconnect in a way that breaks
 * BullMQ's own retry logic. See BullMQ's connection docs.
 *
 * `lazyConnect: true` is equally important for a different reason: this
 * module is imported transitively by controllers (via queues.ts), which
 * are imported by app.ts, which unit tests import to build the Express
 * app — WITHOUT `lazyConnect`, `new Redis(...)` opens a real TCP
 * connection attempt at module-import time, so every test run tries to
 * hit a live Redis server even for tests that have nothing to do with
 * queues. With `lazyConnect: true`, the connection is only opened on the
 * first actual command (the first `queue.add()` or worker job pull) —
 * exactly the behavior production needs, without unit tests silently
 * depending on network access.
 */
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
