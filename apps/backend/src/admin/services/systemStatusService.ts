// apps/backend/src/admin/services/systemStatusService.ts
//
// dev-tasks.md §22's design-mockup "System" section (service health,
// integrations, deployment info). Deliberately narrow, stated
// explicitly: this reports what this codebase can ACTUALLY observe
// today — MongoDB's real connection state (mongoose.connection.
// readyState) and a real Redis ping (shared/queue/redisConnection.ts) —
// plus which optional integrations are CONFIGURED (env vars present),
// not verified reachable (pinging Stripe/Twilio on every status check
// would add latency and its own failure surface for little value; S3 and
// Stripe are already required at boot — env.ts throws if missing — so
// "configured" is trivially always true for those once the process is
// running at all). This is NOT the full observability stack dev-
// tasks.md §32 describes (error tracking, queue monitoring, slow-query
// monitoring) — that needs real infrastructure this session doesn't add.

import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { redisConnection } from '../../shared/queue/redisConnection.js';

const MONGO_READY_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export interface ServiceHealth {
  service: string;
  status: 'connected' | 'disconnected' | 'error';
  detail?: string;
}

export interface IntegrationStatus {
  name: string;
  configured: boolean;
}

export interface SystemStatus {
  services: ServiceHealth[];
  integrations: IntegrationStatus[];
  deployment: { uptimeSeconds: number; nodeVersion: string };
}

async function checkMongo(): Promise<ServiceHealth> {
  const state = mongoose.connection.readyState;
  return {
    service: 'MongoDB',
    status: state === 1 ? 'connected' : 'disconnected',
    detail: MONGO_READY_STATES[state] ?? `unknown (${state})`,
  };
}

async function checkRedis(): Promise<ServiceHealth> {
  try {
    // A real ping, not a property read — redisConnection uses
    // lazyConnect (see that file's own comment on why), so this is the
    // first point a connection is actually attempted, exactly what a
    // health check should do. A short timeout keeps a fully-down Redis
    // from hanging this endpoint.
    const result = await Promise.race([
      redisConnection.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timed out')), 2000),
      ),
    ]);
    return { service: 'Redis', status: result === 'PONG' ? 'connected' : 'error' };
  } catch (error) {
    return {
      service: 'Redis',
      status: 'error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function checkIntegrations(): IntegrationStatus[] {
  return [
    // Required at boot (config/env.ts throws otherwise) — "configured"
    // is therefore always true once the process is up. Listed anyway so
    // the admin panel shows a complete, honest picture rather than
    // silently omitting rows.
    { name: 'Stripe', configured: Boolean(env.STRIPE_SECRET_KEY) },
    { name: 'Object storage (S3)', configured: Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID) },
    {
      name: 'SMS (Twilio)',
      configured: env.SMS_PROVIDER === 'twilio' && Boolean(env.TWILIO_ACCOUNT_SID),
    },
  ];
}

export async function computeSystemStatus(): Promise<SystemStatus> {
  const [mongo, redis] = await Promise.all([checkMongo(), checkRedis()]);
  return {
    services: [mongo, redis],
    integrations: checkIntegrations(),
    deployment: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
    },
  };
}
