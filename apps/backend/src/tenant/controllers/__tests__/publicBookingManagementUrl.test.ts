// apps/backend/src/tenant/controllers/__tests__/publicBookingManagementUrl.test.ts
//
// HANDOFF_2.md §4 item 3: the booking-management link's base domain used
// to be hardcoded (`https://beautybook.no`) inside publicController.ts.
// It now comes from env.PUBLIC_SITE_BASE_URL (config/env.ts) — this file
// proves the function reads the shipped DEFAULT. The override case
// (a different env.PUBLIC_SITE_BASE_URL value) lives in its own file,
// publicBookingManagementUrl.override.test.ts — a single vi.mock of
// config/env.js has to be declared once, statically, for a whole file
// (Vitest hoists vi.mock calls to the top); putting both the default and
// override cases in one file would need vi.resetModules() to swap the
// mock mid-file, which re-executes publicController.ts's full import
// chain including every Mongoose model it pulls in transitively
// (companyRepository -> CompanyModel etc.) — and Mongoose's global model
// registry does NOT reset along with Vitest's module cache, producing
// `OverwriteModelError: Cannot overwrite \`Company\` model once compiled`
// on the second import. Two separate files sidestep this entirely (same
// fix already applied to publicController.concurrency.test.ts).
//
// The URL's PATH shape (`/manage-booking/:token`) remains a documented
// placeholder — see publicController.ts's header comment — and is out of
// scope for this test.

import { describe, expect, it } from 'vitest';

import { publicBookingManagementUrl } from '../publicController.js';

describe('publicBookingManagementUrl — default', () => {
  it('uses the default PUBLIC_SITE_BASE_URL (production domain) when no override is set', () => {
    expect(publicBookingManagementUrl('acme-salon', 'tok_abc123')).toBe(
      'https://beautybook.no/acme-salon/manage-booking/tok_abc123',
    );
  });
});
