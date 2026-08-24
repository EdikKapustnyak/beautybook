// apps/backend/src/tenant/controllers/__tests__/publicController.test.ts
//
// Round 3 finding #3: publicController.ts — the single fully
// unauthenticated, public-internet-facing surface of the API — had ZERO
// tests. This file covers the three groups from
// round3-findings-and-fixes.md that don't require a live database:
// anti-enumeration, token-confusion defense at the controller boundary,
// and the "phone always comes from the verified token, never the
// request body" invariant.
//
// NOT covered here: the 20-concurrent-requests race-condition test
// through the actual public HTTP path (round3 finding #3's 4th group).
// bookingService.test.ts already has this exact pattern against
// bookingService directly, using in-memory fakes with real atomicity
// (Node's single-threaded execution model makes a synchronous
// check-then-set in a Map genuinely atomic across await boundaries, the
// same guarantee the real Mongo unique-index SlotLock provides). Rather
// than reinvent those fakes with guesswork and risk a test that LOOKS
// like it proves atomicity but doesn't, this is deliberately left as a
// follow-up: reuse bookingService.test.ts's exact in-memory
// booking/slotLock/customer fakes, wire them into bookingService.instance
// via vi.mock, and run the same concurrent-request pattern through
// createPublicBooking instead of bookingService.createBooking directly.
//
// Testing approach: getPublicCompany, createPublicBooking, etc. are
// plain `asyncHandler(async (req, res) => {...})` constants, not
// factories — same asyncHandler fire-and-forget issue documented in
// requireTenantAuth.ts's doc comment (calling them directly and
// `await`-ing the call resolves before the internal work finishes).
// `invokeHandler` below resolves based on the handler's actual
// side-effect (res.json() called, or next(err) called) instead of
// awaiting the handler's own return value.

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  bookingRepository: {
    listInCompany: vi.fn(async () => ({ items: [], total: 0 })),
    findByIdInCompany: vi.fn(),
  },
}));
vi.mock('../../repositories/customerRepository.js', () => ({
  customerRepository: { findByIdInCompany: vi.fn() },
}));
vi.mock('../../services/availabilityEngine.js', () => ({
  getDayBoundsUtc: vi.fn(() => ({ start: new Date('2026-01-01'), end: new Date('2026-01-02') })),
  isSlotAvailable: vi.fn(() => true),
  calculateAvailableSlots: vi.fn(() => []),
}));
vi.mock('../../services/bookingService.instance.js', () => ({
  bookingService: {
    createBooking: vi.fn(),
    updateStatus: vi.fn(),
    rescheduleBooking: vi.fn(),
  },
}));
vi.mock('../../services/notificationService.instance.js', () => ({
  notificationService: { enqueue: vi.fn(async () => ({ id: 'notif-1' })) },
}));
vi.mock('../../../shared/queue/queues.js', () => ({
  notificationsQueue: { add: vi.fn(async () => undefined) },
}));

// Deliberately NOT mocked: shared/security/publicBookingTokens.js — using
// the REAL issue/verify functions makes the token-confusion tests below
// exercise the actual cross-check, not a stand-in that could drift from
// real behavior.

import { companyRepository } from '../../repositories/companyRepository.js';
import { employeeRepository } from '../../repositories/employeeRepository.js';
import { serviceRepository } from '../../repositories/serviceRepository.js';
import { bookingRepository } from '../../repositories/bookingRepository.js';
import { bookingService } from '../../services/bookingService.instance.js';
import {
  issuePhoneVerificationToken,
  issueBookingManagementToken,
} from '../../../shared/security/publicBookingTokens.js';
import { getPublicCompany, cancelPublicBooking, createPublicBooking } from '../publicController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, params: {}, query: {}, body: {}, ...overrides } as Request;
}

/**
 * Resolves once the handler either responds (res.json) or forwards an
 * error (next(err)) — see file header for why a plain `await handler(...)`
 * doesn't work for asyncHandler-wrapped exports.
 */
function invokeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
): Promise<{ status: number; body: unknown } | { error: unknown }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        resolve({ status: statusCode, body });
      },
    } as unknown as Response;
    const next = ((err?: unknown) => {
      if (err) resolve({ error: err });
    }) as NextFunction;
    handler(req, res, next);
  });
}

const ACTIVE_COMPANY = {
  _id: 'company-1',
  name: 'Test Salon',
  slug: 'test-salon',
  timezone: 'Europe/Oslo',
  currency: 'NOK',
  status: 'active',
};

type CompanyFixture = Awaited<ReturnType<typeof companyRepository.findBySlug>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('anti-enumeration (round3: was already correct, guards against regression)', () => {
  it('returns an identical error for a nonexistent, a draft, and a suspended slug', async () => {
    const mockedFindBySlug = vi.mocked(companyRepository.findBySlug);

    mockedFindBySlug.mockResolvedValueOnce(null);
    const nonexistent = await invokeHandler(
      getPublicCompany,
      buildReq({ params: { slug: 'ghost' } }),
    );

    mockedFindBySlug.mockResolvedValueOnce({
      ...ACTIVE_COMPANY,
      status: 'draft',
    } as unknown as CompanyFixture);
    const draft = await invokeHandler(getPublicCompany, buildReq({ params: { slug: 'draft-co' } }));

    mockedFindBySlug.mockResolvedValueOnce({
      ...ACTIVE_COMPANY,
      status: 'suspended',
    } as unknown as CompanyFixture);
    const suspended = await invokeHandler(
      getPublicCompany,
      buildReq({ params: { slug: 'suspended-co' } }),
    );

    expect('error' in nonexistent).toBe(true);
    expect('error' in draft).toBe(true);
    expect('error' in suspended).toBe(true);
    // Not just "all three errored" — the actual error object (status
    // code + message) must be indistinguishable, or the response itself
    // leaks which case occurred.
    expect(nonexistent).toEqual(draft);
    expect(draft).toEqual(suspended);
  });

  it('succeeds for an active company (sanity check the mock setup itself is valid)', async () => {
    vi.mocked(companyRepository.findBySlug).mockResolvedValueOnce(
      ACTIVE_COMPANY as unknown as CompanyFixture,
    );

    const result = await invokeHandler(
      getPublicCompany,
      buildReq({ params: { slug: 'test-salon' } }),
    );

    expect('error' in result).toBe(false);
  });
});

describe('token confusion defense at the controller boundary', () => {
  beforeEach(() => {
    vi.mocked(companyRepository.findBySlug).mockResolvedValue(
      ACTIVE_COMPANY as unknown as CompanyFixture,
    );
  });

  it('rejects a phone-verification token presented as a booking-management token on cancel', async () => {
    const phoneToken = issuePhoneVerificationToken({ phone: '+4790000000' });

    const result = await invokeHandler(
      cancelPublicBooking,
      buildReq({ params: { slug: 'test-salon', token: phoneToken }, body: {} }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as Error).message).toMatch(/invalid or expired/i);
    }
  });
});

describe('createPublicBooking never trusts req.body.phone', () => {
  beforeEach(() => {
    vi.mocked(companyRepository.findBySlug).mockResolvedValue(
      ACTIVE_COMPANY as unknown as CompanyFixture,
    );
    vi.mocked(employeeRepository.findByIdInCompany).mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      active: true,
      workingHours: {},
    } as unknown as Awaited<ReturnType<typeof employeeRepository.findByIdInCompany>>);
    vi.mocked(serviceRepository.findByIdInCompany).mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      active: true,
      employeeIds: ['507f1f77bcf86cd799439011'],
      durationMinutes: 60,
      bufferMinutes: 15,
    } as unknown as Awaited<ReturnType<typeof serviceRepository.findByIdInCompany>>);
    vi.mocked(bookingRepository.listInCompany).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(bookingService.createBooking).mockResolvedValue({
      id: 'booking-1',
      status: 'pending',
      startAt: new Date('2026-02-01T10:00:00Z'),
    } as unknown as Awaited<ReturnType<typeof bookingService.createBooking>>);
  });

  it('uses the phone from the verified phoneVerificationToken (there is no body field for it at all)', async () => {
    const realPhone = '+4790000001';
    const phoneVerificationToken = issuePhoneVerificationToken({ phone: realPhone });

    const req = buildReq({
      params: { slug: 'test-salon' },
      body: {
        phoneVerificationToken,
        employeeId: '507f1f77bcf86cd799439011',
        serviceId: '507f1f77bcf86cd799439012',
        startAt: '2026-02-01T10:00:00.000Z',
        customerName: 'Test Customer',
      },
    });

    await invokeHandler(createPublicBooking, req);

    expect(bookingService.createBooking).toHaveBeenCalledOnce();
    const [createBookingArg] = vi.mocked(bookingService.createBooking).mock.calls[0]!;
    expect(createBookingArg.customer.phone).toBe(realPhone);
  });

  it('rejects the request outright if a phone field is smuggled into the body (createPublicBookingSchema is .strict())', async () => {
    // Unlike a permissive schema that would silently strip an unknown
    // field, `.strict()` REJECTS the entire request the moment an
    // unrecognized key is present — a stronger guarantee than "the extra
    // field is ignored": there is structurally no way to even attempt
    // submitting a phone number in the body without the whole request
    // failing validation before the handler's own logic ever runs.
    const phoneVerificationToken = issuePhoneVerificationToken({ phone: '+4790000001' });

    const req = buildReq({
      params: { slug: 'test-salon' },
      body: {
        phoneVerificationToken,
        employeeId: '507f1f77bcf86cd799439011',
        serviceId: '507f1f77bcf86cd799439012',
        startAt: '2026-02-01T10:00:00.000Z',
        customerName: 'Test Customer',
        phone: '+4799999999', // not a real field on the schema
      },
    });

    const result = await invokeHandler(createPublicBooking, req);

    expect('error' in result).toBe(true);
    expect(bookingService.createBooking).not.toHaveBeenCalled();
  });

  it('rejects createPublicBooking outright if phoneVerificationToken is actually a booking-management token', async () => {
    const managementToken = issueBookingManagementToken({ bookingId: 'unrelated-booking' });

    const req = buildReq({
      params: { slug: 'test-salon' },
      body: {
        phoneVerificationToken: managementToken,
        employeeId: '507f1f77bcf86cd799439011',
        serviceId: '507f1f77bcf86cd799439012',
        startAt: '2026-02-01T10:00:00.000Z',
        customerName: 'Test Customer',
      },
    });

    const result = await invokeHandler(createPublicBooking, req);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as Error).message).toMatch(/invalid or expired/i);
    }
    expect(bookingService.createBooking).not.toHaveBeenCalled();
  });
});
