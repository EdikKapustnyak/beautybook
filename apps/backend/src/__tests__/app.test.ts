import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

const app = createApp();

describe('GET /health', () => {
  it('returns a 200 with a stable success payload', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});

describe('GET /ready', () => {
  it('returns a 200 readiness payload', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ready' } });
  });
});

describe('unknown routes', () => {
  it('returns a safe, structured 404 without leaking internals', async () => {
    const response = await request(app).get('/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });
});

describe('tenant/admin surface separation', () => {
  it('exposes /api/tenant/status with the tenant cookie name only', async () => {
    const response = await request(app).get('/api/tenant/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { surface: 'tenant', refreshCookieName: 'bb_tenant_refresh' },
    });
  });

  it('exposes /api/admin/status with the admin cookie name only', async () => {
    const response = await request(app).get('/api/admin/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { surface: 'admin', refreshCookieName: 'bb_admin_refresh' },
    });
  });

  it('uses different cookie names for tenant vs admin sessions', async () => {
    const tenantResponse = await request(app).get('/api/tenant/status');
    const adminResponse = await request(app).get('/api/admin/status');

    expect(tenantResponse.body.data.refreshCookieName).not.toBe(
      adminResponse.body.data.refreshCookieName,
    );
  });

  it('rejects requests to /api/admin/* from the public tenant origin', async () => {
    const response = await request(app)
      .get('/api/admin/status')
      .set('Origin', 'http://localhost:3000');

    // CORS is enforced by the browser using the response header, not by
    // Express rejecting the request outright — assert the admin router
    // does not echo back an untrusted tenant origin as allowed.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects requests to /api/tenant/* from the admin app origin', async () => {
    const response = await request(app)
      .get('/api/tenant/status')
      .set('Origin', 'http://localhost:3100');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
