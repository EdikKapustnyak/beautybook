import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/queue/redisConnection.js', () => ({
  redisConnection: { ping: vi.fn() },
}));

import { redisConnection } from '../../../shared/queue/redisConnection.js';
import { computeSystemStatus } from '../systemStatusService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeSystemStatus', () => {
  it('reports MongoDB as disconnected when readyState is not 1 (sandbox has no live connection)', async () => {
    vi.mocked(redisConnection.ping).mockResolvedValue('PONG');

    const result = await computeSystemStatus();
    const mongo = result.services.find((s) => s.service === 'MongoDB');

    expect(mongo?.status).toBe(mongoose.connection.readyState === 1 ? 'connected' : 'disconnected');
  });

  it('reports Redis as connected on a successful PONG', async () => {
    vi.mocked(redisConnection.ping).mockResolvedValue('PONG');

    const result = await computeSystemStatus();
    const redis = result.services.find((s) => s.service === 'Redis');

    expect(redis?.status).toBe('connected');
  });

  it('reports Redis as error (not a thrown exception) when the ping fails', async () => {
    vi.mocked(redisConnection.ping).mockRejectedValue(new Error('connection refused'));

    const result = await computeSystemStatus();
    const redis = result.services.find((s) => s.service === 'Redis');

    expect(redis?.status).toBe('error');
    expect(redis?.detail).toContain('connection refused');
  });

  it('lists integrations with a configured boolean, never throwing on missing optional ones', async () => {
    vi.mocked(redisConnection.ping).mockResolvedValue('PONG');

    const result = await computeSystemStatus();

    expect(result.integrations.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Stripe', 'Object storage (S3)', 'SMS (Twilio)']),
    );
  });

  it('includes deployment uptime and node version', async () => {
    vi.mocked(redisConnection.ping).mockResolvedValue('PONG');

    const result = await computeSystemStatus();

    expect(result.deployment.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(result.deployment.nodeVersion).toBe(process.version);
  });
});
