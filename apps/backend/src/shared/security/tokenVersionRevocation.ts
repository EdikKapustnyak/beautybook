// apps/backend/src/shared/security/tokenVersionRevocation.ts
//
// Closes the "stale role/status in access token" window (see
// stale-role-window-fix_1.md, mechanism 1). Design decision made
// explicitly during planning: this is a WRITE-THROUGH-ONLY revocation
// list, not a mirror of every user's tokenVersion.
//
//   - A key is written ONLY at the moment a user's role/status changes
//     (see authService.updateUserRoleOrStatus / adminAuthService
//     equivalent), storing the new minimum-valid tokenVersion.
//   - TTL equals the access-token TTL exactly (not "slightly more" as
//     first drafted) — once that much time has passed, no unexpired
//     token signed before the change can possibly still exist, so the
//     revocation record can safely disappear.
//   - A MISSING key means "nothing changed recently for this user" and
//     is treated as trust-the-token, with NO fallback read to MongoDB.
//     This is what makes the check cheap enough to run on every
//     request: the overwhelming majority of users, at any given moment,
//     have no key here at all.
//
// If this were instead "populate lazily from Mongo on cache miss", every
// request for a never-revoked user would still hit the database, which
// defeats the entire point of adding this layer (technical-spec.md §1's
// UTC/DB-load discipline, and the explicit alternative-rejected reasoning
// in stale-role-window-fix_1.md section 1).
//
// Redis errors fail OPEN (trust the token) on read, and are swallowed
// (logged only) on write — same resilience principle already used for
// reminderScheduler and notification enqueueing elsewhere in this
// codebase (bookingController.ts's enqueueBookingNotification,
// bookingService's safeScheduleReminders). A Redis outage should degrade
// this defense-in-depth layer back to "access token TTL is the window",
// not take down the entire API.
//
// Deliberately takes the Redis client as a constructor parameter (same
// port/adapter-free-but-injectable style as the rest of this codebase's
// services) rather than importing the `redisConnection` singleton
// directly, so unit tests can pass a fake without touching real Redis.

export interface RevocationRedisClient {
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export interface TokenVersionRevocationStore {
  /**
   * Call at the moment a user's role or status changes. `minValidVersion`
   * should be the NEW tokenVersion after the change — any presented
   * access token with a lower embedded tokenVersion is stale.
   */
  revoke(key: string, minValidVersion: number, ttlSeconds: number): Promise<void>;
  /**
   * Call on every authenticated request, after JWT signature/expiry
   * verification. Returns true only if a revocation record exists AND
   * the presented version is below it — a missing record is NOT a
   * revocation, by design (see header comment).
   */
  isRevoked(key: string, presentedVersion: number): Promise<boolean>;
}

export function createTokenVersionRevocationStore(
  redis: RevocationRedisClient,
): TokenVersionRevocationStore {
  return {
    async revoke(key, minValidVersion, ttlSeconds) {
      try {
        await redis.set(key, String(minValidVersion), 'EX', ttlSeconds);
      } catch (error) {
        // Best-effort: a failed write here only means the access-token
        // window fix didn't get faster for this one event — the
        // pre-existing 15-minute-TTL behavior is the fallback, not a
        // security bypass. Never let this break the role/status change
        // itself.
        console.error('Failed to write token version revocation record:', error);
      }
    },
    async isRevoked(key, presentedVersion) {
      try {
        const cached = await redis.get(key);
        if (cached === null) {
          return false;
        }
        return presentedVersion < Number(cached);
      } catch (error) {
        // Fail OPEN: a Redis outage degrades this layer back to
        // access-token-TTL-is-the-window, it must never turn into a
        // hard 401 for every authenticated request in the product.
        console.error('Failed to read token version revocation record:', error);
        return false;
      }
    },
  };
}

export function tenantTokenVersionKey(userId: string): string {
  return `token-version:tenant:${userId}`;
}

export function adminTokenVersionKey(adminUserId: string): string {
  return `token-version:admin:${adminUserId}`;
}
