// apps/backend/src/tenant/controllers/__tests__/publicBookingManagementUrl.override.test.ts
//
// Companion to publicBookingManagementUrl.test.ts — see that file's
// header for why the override case needs its own file (a statically
// hoisted vi.mock, not a mid-file vi.resetModules() swap).

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: { PUBLIC_SITE_BASE_URL: 'https://staging.beautybook.no' },
}));

import { publicBookingManagementUrl } from '../publicController.js';

describe('publicBookingManagementUrl — overridden', () => {
  it('uses an overridden PUBLIC_SITE_BASE_URL (e.g. a staging domain)', () => {
    expect(publicBookingManagementUrl('acme-salon', 'tok_abc123')).toBe(
      'https://staging.beautybook.no/acme-salon/manage-booking/tok_abc123',
    );
  });
});
