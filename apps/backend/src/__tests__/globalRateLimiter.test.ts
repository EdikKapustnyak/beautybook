// apps/backend/src/__tests__/globalRateLimiter.test.ts
//
// dev-tasks.md §23 "Global API limiter" — closes the gap the full
// security audit (dev-tasks.md §30) flagged: previously only specific
// endpoints (login/register/OTP/booking/password-reset) had rate
// limiting; every other route (list/search/read endpoints, etc.) had
// none. Proves the limiter is genuinely mounted on both `/api/tenant`
// and `/api/admin` with the intended bounds, via the real
// `RateLimit-Limit` response header — NOT by exhausting 600 requests
// (too slow for a unit test; the header is what express-rate-limit
// itself reports as configured, so reading it is a faithful proxy for
// "the limiter is wired with this exact value").
//
// Does NOT assert anything about /health, /ready, or /webhooks/stripe —
// see app.ts's own comment for why those are deliberately excluded.

import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

const app = createApp();

describe('global API rate limiter', () => {
  it('is mounted on /api/tenant with a 600/15min bound', async () => {
    // Any route under /api/tenant works for this — using the cheapest
    // one available (a 404 for a made-up path) since we only care about
    // the middleware chain's headers, not this specific route's logic.
    const response = await request(app).get('/api/tenant/__rate-limit-probe__');

    expect(response.headers['ratelimit-limit']).toBe('600');
  });

  it('is mounted on /api/admin with a tighter 300/15min bound', async () => {
    const response = await request(app).get('/api/admin/__rate-limit-probe__');

    expect(response.headers['ratelimit-limit']).toBe('300');
  });

  it('does NOT apply to /health (never throttle health checks)', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['ratelimit-limit']).toBeUndefined();
  });

  it('does NOT apply to /webhooks/stripe (Stripe can legitimately burst from shared IPs)', async () => {
    const response = await request(app).post('/webhooks/stripe').send('{}');

    expect(response.headers['ratelimit-limit']).toBeUndefined();
  });
});
