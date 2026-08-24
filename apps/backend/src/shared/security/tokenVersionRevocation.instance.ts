// apps/backend/src/shared/security/tokenVersionRevocation.instance.ts
//
// Wires the real ioredis connection into the store. One shared instance
// serves BOTH tenant and admin auth — the tenant/admin separation lives
// in the key names (tenantTokenVersionKey/adminTokenVersionKey), not in
// having two separate store instances, since the store itself is stateless
// besides the Redis connection it wraps.

import { redisConnection } from '../queue/redisConnection.js';
import { createTokenVersionRevocationStore } from './tokenVersionRevocation.js';

export const tokenVersionRevocationStore = createTokenVersionRevocationStore(redisConnection);
