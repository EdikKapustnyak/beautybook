// apps/backend/src/tenant/controllers/__tests__/publicController.concurrency.test.ts
//
// HANDOFF_2.md §4 item 1 — the one deliberately-deferred piece of Round 3
// finding #3: prove the double-booking guarantee holds through the REAL
// public, unauthenticated HTTP path (POST /api/tenant/public/:slug/booking),
// not just through bookingService.createBooking called directly (already
// covered exhaustively by bookingService.test.ts).
//
// Approach, exactly as flagged in publicController.test.ts's own header
// comment: reuse bookingService.test.ts's in-memory booking/slotLock/
// customer fakes (inMemoryBookingPorts.ts), wire them into the REAL
// createBookingService (not a vi.fn() stub) via vi.mock on
// bookingService.instance.js, and drive N concurrent requests through
// supertest against the real Express app (createApp()) — so the entire
// chain (route -> rate limiter -> controller -> Zod validation -> token
// verification -> availability recheck -> bookingService -> SlotLock
// reservation) is exercised for real. Only genuinely external/infra
// concerns (Mongo-backed repositories other than booking, SMS queueing)
// are mocked — the atomicity guarantee itself is never faked.
//
// Deliberately real (NOT mocked): availabilityEngine.js
// (getDayBoundsUtc/isSlotAvailable), shared/security/publicBookingTokens.js
// (issue/verify), and — the whole point of this file — bookingService's
// actual reserve-before-create logic against the real SlotLock uniqueness
// constraint (emulated in-memory exactly as MongoDB's unique compound
// index on (employeeId, cellKey) would enforce it — see
// inMemoryBookingPorts.ts's own header comment).
//
// Rate limiters are stubbed to pass-through here ONLY: publicBookingLimiter
// caps at 10 req/min per IP (publicRateLimiters.ts), which would otherwise
// confound a 20-way burst with 429s unrelated to the property under test.
// The limiter itself is a separate, already-reviewed concern
// (security-measures.md §15/§23) — not what this file is verifying.
//
// Module/state isolation: bookingService.instance.js's mock factory below
// runs ONCE for this whole file (standard Vitest per-file module graph —
// same as every other mocked singleton in this codebase's test suite), so
// its in-memory booking/slotLock state is SHARED across every `it()` here,
// exactly as it would be against a real, un-reset MongoDB collection
// shared by several test cases. `vi.resetModules()` was tried and
// discarded: it also tears down mongoose's global model registry
// (imported transitively through createApp() -> adminRouter -> admin
// models), causing `OverwriteModelError: Cannot overwrite "AdminSession"
// model once compiled` on the second re-import — an unrelated module far
// outside what this file is testing. The correct, simpler fix (mirroring
// how a shared-database integration suite would be written): give every
// `it()` its own non-overlapping calendar slot(s), so one test's booking
// can never be mistaken for state leakage into another.

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/publicRateLimiters.js', () => {
  const passThrough = (_req: unknown, _res: unknown, next: (...args: unknown[]) => void): void =>
    next();
  return {
    publicAvailabilityLimiter: passThrough,
    publicCompanyLookupLimiter: passThrough,
    publicOtpRequestLimiter: passThrough,
    publicOtpVerifyLimiter: passThrough,
    publicBookingLimiter: passThrough,
    publicBookingManagementLimiter: passThrough,
  };
});

vi.mock('../../repositories/companyRepository.js', () => ({
  companyRepository: { findBySlug: vi.fn() },
}));
vi.mock('../../repositories/employeeRepository.js', () => ({
  employeeRepository: { findByIdInCompany: vi.fn(), listInCompany: vi.fn() },
}));
vi.mock('../../repositories/serviceRepository.js', () => ({
  serviceRepository: { findByIdInCompany: vi.fn(), listInCompany: vi.fn() },
}));
vi.mock('../../repositories/blockedTimeRepository.js', () => ({
  blockedTimeRepository: { listForEmployeeAvailability: vi.fn(async () => []) },
}));
vi.mock('../../repositories/bookingRepository.js', () => ({
  // Deliberately always empty: the DB-level recheck seeing "nothing
  // booked yet" for every one of the N concurrent requests is exactly
  // the race scenario dev-tasks.md §10 describes — it's the SlotLock
  // reservation inside the REAL bookingService (not this mock) that must
  // be the thing actually preventing the double-booking, not this check.
  bookingRepository: {
    listInCompany: vi.fn(async () => ({ items: [], total: 0 })),
    findByIdInCompany: vi.fn(),
  },
}));
vi.mock('../../repositories/customerRepository.js', () => ({
  customerRepository: { findByIdInCompany: vi.fn() },
}));
vi.mock('../../services/notificationService.instance.js', () => ({
  notificationService: { enqueue: vi.fn(async () => ({ id: 'notif-1' })) },
}));
vi.mock('../../../shared/queue/queues.js', () => ({
  notificationsQueue: { add: vi.fn(async () => undefined) },
}));

// The one substitution that matters: bookingService.instance.js normally
// wires the REAL bookingService to Mongo-backed adapters
// (bookingRepositoryAdapters.ts) — unusable here (no live MongoDB). This
// swaps ONLY the adapters, not the service logic: createBookingService
// itself (reserve-before-create, SlotLock cell math, conflict handling)
// is the genuine, unmodified implementation from bookingService.ts, bound
// to the SAME in-memory fakes bookingService.test.ts uses, which enforce
// the identical (employeeId, cellKey) uniqueness constraint a real Mongo
// unique index would.
vi.mock('../../services/bookingService.instance.js', async () => {
  const { createBookingService } = await import('../../services/bookingService.js');
  const { createInMemoryBookingRepo, createInMemoryCustomerRepo, createInMemorySlotLockRepo } =
    await import('../../services/__tests__/inMemoryBookingPorts.js');

  const bookingService = createBookingService({
    bookingRepo: createInMemoryBookingRepo(),
    slotLockRepo: createInMemorySlotLockRepo(),
    customerRepo: createInMemoryCustomerRepo(),
    // No reminderScheduler — optional dep, exercising the "no scheduler
    // wired" path is fine and keeps this test free of BullMQ/Redis.
  });

  return { bookingService };
});

import { companyRepository } from '../../repositories/companyRepository.js';
import { employeeRepository } from '../../repositories/employeeRepository.js';
import { serviceRepository } from '../../repositories/serviceRepository.js';
import { notificationService } from '../../services/notificationService.instance.js';
import { issuePhoneVerificationToken } from '../../../shared/security/publicBookingTokens.js';
import { createApp } from '../../../app.js';

const app = createApp();

const COMPANY_ID = '507f1f77bcf86cd799439001';
const EMPLOYEE_ID = '507f1f77bcf86cd799439011';
const SERVICE_ID = '507f1f77bcf86cd799439012';
const SLUG = 'test-salon';

const ACTIVE_COMPANY = {
  _id: COMPANY_ID,
  name: 'Test Salon',
  slug: SLUG,
  timezone: 'Europe/Oslo',
  currency: 'NOK',
  status: 'active',
};

const ACTIVE_EMPLOYEE = {
  _id: EMPLOYEE_ID,
  active: true,
  // Open 08:00-18:00 Oslo time, every day of the week — every `it()`
  // below picks its own calendar date (see file header on why), so the
  // fixture just needs to cover whichever weekday each one lands on.
  workingHours: {
    monday: [{ start: '08:00', end: '18:00' }],
    tuesday: [{ start: '08:00', end: '18:00' }],
    wednesday: [{ start: '08:00', end: '18:00' }],
    thursday: [{ start: '08:00', end: '18:00' }],
    friday: [{ start: '08:00', end: '18:00' }],
    saturday: [{ start: '08:00', end: '18:00' }],
    sunday: [{ start: '08:00', end: '18:00' }],
  },
};

const ACTIVE_SERVICE = {
  _id: SERVICE_ID,
  name: 'Manicure',
  active: true,
  employeeIds: [EMPLOYEE_ID],
  durationMinutes: 60,
  bufferMinutes: 0,
};

type CompanyFixture = Awaited<ReturnType<typeof companyRepository.findBySlug>>;
type EmployeeFixture = Awaited<ReturnType<typeof employeeRepository.findByIdInCompany>>;
type ServiceFixture = Awaited<ReturnType<typeof serviceRepository.findByIdInCompany>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(companyRepository.findBySlug).mockResolvedValue(
    ACTIVE_COMPANY as unknown as CompanyFixture,
  );
  vi.mocked(employeeRepository.findByIdInCompany).mockResolvedValue(
    ACTIVE_EMPLOYEE as unknown as EmployeeFixture,
  );
  vi.mocked(serviceRepository.findByIdInCompany).mockResolvedValue(
    ACTIVE_SERVICE as unknown as ServiceFixture,
  );
});

/** One booking request body, with its own verified phone (a distinct customer per call). */
function buildBookingPayload(phone: string, startAtIso: string) {
  const phoneVerificationToken = issuePhoneVerificationToken({ phone });
  return {
    phoneVerificationToken,
    employeeId: EMPLOYEE_ID,
    serviceId: SERVICE_ID,
    startAt: startAtIso,
    customerName: `Customer ${phone}`,
  };
}

function postBooking(payload: ReturnType<typeof buildBookingPayload>) {
  return request(app).post(`/api/tenant/public/${SLUG}/booking`).send(payload);
}

describe('POST /api/tenant/public/:slug/booking — concurrency through the real public HTTP path', () => {
  it('exactly ONE of 5 concurrent requests for the identical slot succeeds; the other 4 get BOOKING_CONFLICT', async () => {
    const slot = '2026-06-15T09:00:00.000Z'; // Monday
    const payloads = Array.from({ length: 5 }, (_, i) =>
      buildBookingPayload(`+479100000${i}`, slot),
    );

    const responses = await Promise.all(payloads.map((payload) => postBooking(payload)));

    const succeeded = responses.filter((r) => r.status === 201);
    const conflicted = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(4);
    expect(succeeded[0]?.body).toMatchObject({
      success: true,
      data: { status: 'confirmed' },
    });
    for (const response of conflicted) {
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'BOOKING_CONFLICT',
          message: 'The selected time is no longer available.',
        },
      });
    }

    // dev-tasks.md §10: "нет двойной SMS confirmation" — only the winner
    // ever reaches the notification-enqueue step.
    expect(notificationService.enqueue).toHaveBeenCalledTimes(1);

    // HANDOFF_2.md §4 item 5 regression check, at the real HTTP layer:
    // the confirmation SMS body must show the company's LOCAL time
    // (Europe/Oslo, matching ACTIVE_COMPANY's fixture) via
    // publicBookingConfirmationMessage, not the raw UTC ISO timestamp
    // that used to be built inline in this controller, and must include
    // the management link.
    const enqueueCall = vi.mocked(notificationService.enqueue).mock.calls[0]?.[1] as
      { body: string } | undefined;
    expect(enqueueCall?.body).toContain('11:00'); // 09:00 UTC -> 11:00 Europe/Oslo (CEST, June)
    expect(enqueueCall?.body).not.toContain(slot);
    expect(enqueueCall?.body).toContain(`${SLUG}/manage-booking/`);
  });

  it('exactly ONE of 20 concurrent requests for the identical slot succeeds', async () => {
    const slot = '2026-06-16T09:00:00.000Z'; // Tuesday — own date, no overlap with the test above
    const payloads = Array.from({ length: 20 }, (_, i) =>
      buildBookingPayload(`+47920000${String(i).padStart(3, '0')}`, slot),
    );

    const responses = await Promise.all(payloads.map((payload) => postBooking(payload)));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(19);
    expect(notificationService.enqueue).toHaveBeenCalledTimes(1);
  });

  it('concurrent requests for DIFFERENT (non-overlapping) times on the same employee all succeed', async () => {
    const dayStart = new Date('2026-06-17T09:00:00.000Z'); // Wednesday — own date
    const payloads = Array.from({ length: 5 }, (_, i) => {
      const start = new Date(dayStart.getTime() + i * 60 * 60_000);
      return buildBookingPayload(`+479300000${i}`, start.toISOString());
    });

    const responses = await Promise.all(payloads.map((payload) => postBooking(payload)));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(5);
    expect(notificationService.enqueue).toHaveBeenCalledTimes(5);
  });

  it('a losing request never creates a booking — a later request for a DIFFERENT slot still succeeds cleanly', async () => {
    const contestedSlot = '2026-06-18T09:00:00.000Z'; // Thursday — own date
    const contested = Array.from({ length: 5 }, (_, i) =>
      buildBookingPayload(`+479400000${i}`, contestedSlot),
    );
    await Promise.all(contested.map((payload) => postBooking(payload)));

    const laterSlot = new Date(new Date(contestedSlot).getTime() + 2 * 60 * 60_000).toISOString();
    const response = await postBooking(buildBookingPayload('+4795000000', laterSlot));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: { status: 'confirmed' } });
  });
});
