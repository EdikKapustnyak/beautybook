// apps/backend/src/shared/security/__tests__/tokenVersionRevocation.test.ts

import { describe, expect, it, vi } from 'vitest';

import {
  createTokenVersionRevocationStore,
  tenantTokenVersionKey,
  adminTokenVersionKey,
  type RevocationRedisClient,
} from '../tokenVersionRevocation.js';

/** Minimal in-memory fake — enough to exercise the store's own logic, not ioredis itself. */
function createFakeRedis(): RevocationRedisClient & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async set(key, value) {
      data.set(key, value);
      return 'OK';
    },
    async get(key) {
      return data.get(key) ?? null;
    },
  };
}

describe('tokenVersionRevocation store', () => {
  it('treats a missing key as "not revoked" (no revocation event has happened)', async () => {
    const redis = createFakeRedis();
    const store = createTokenVersionRevocationStore(redis);

    await expect(store.isRevoked(tenantTokenVersionKey('user-1'), 0)).resolves.toBe(false);
  });

  it('reports revoked when the presented version is below the stored minimum', async () => {
    const redis = createFakeRedis();
    const store = createTokenVersionRevocationStore(redis);

    await store.revoke(tenantTokenVersionKey('user-1'), 3, 900);

    await expect(store.isRevoked(tenantTokenVersionKey('user-1'), 2)).resolves.toBe(true);
    await expect(store.isRevoked(tenantTokenVersionKey('user-1'), 0)).resolves.toBe(true);
  });

  it('reports NOT revoked when the presented version meets or exceeds the stored minimum', async () => {
    const redis = createFakeRedis();
    const store = createTokenVersionRevocationStore(redis);

    await store.revoke(tenantTokenVersionKey('user-1'), 3, 900);

    await expect(store.isRevoked(tenantTokenVersionKey('user-1'), 3)).resolves.toBe(false);
    await expect(store.isRevoked(tenantTokenVersionKey('user-1'), 5)).resolves.toBe(false);
  });

  it('passes the exact TTL through to the underlying client, uncorrected', async () => {
    const redis = createFakeRedis();
    const setSpy = vi.spyOn(redis, 'set');
    const store = createTokenVersionRevocationStore(redis);

    await store.revoke(tenantTokenVersionKey('user-1'), 1, 900);

    expect(setSpy).toHaveBeenCalledWith(tenantTokenVersionKey('user-1'), '1', 'EX', 900);
  });

  it('keeps tenant and admin keys for the same raw id fully separate', async () => {
    const redis = createFakeRedis();
    const store = createTokenVersionRevocationStore(redis);

    await store.revoke(tenantTokenVersionKey('same-id'), 5, 900);

    await expect(store.isRevoked(tenantTokenVersionKey('same-id'), 0)).resolves.toBe(true);
    await expect(store.isRevoked(adminTokenVersionKey('same-id'), 0)).resolves.toBe(false);
  });

  it('fails OPEN (not revoked) if the Redis read throws', async () => {
    const redis = createFakeRedis();
    vi.spyOn(redis, 'get').mockRejectedValueOnce(new Error('connection lost'));
    const store = createTokenVersionRevocationStore(redis);

    await expect(store.isRevoked(tenantTokenVersionKey('user-1'), 0)).resolves.toBe(false);
  });

  it('swallows a failed write rather than throwing (best-effort)', async () => {
    const redis = createFakeRedis();
    vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('connection lost'));
    const store = createTokenVersionRevocationStore(redis);

    await expect(store.revoke(tenantTokenVersionKey('user-1'), 1, 900)).resolves.toBeUndefined();
  });
});
