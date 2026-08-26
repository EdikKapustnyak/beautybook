// apps/backend/src/tenant/controllers/__tests__/bookingAttachmentController.test.ts
//
// dev-tasks.md §14 checklist item this file closes: "attachment cannot
// be accessed after authorization is removed" — previously, ANY
// authenticated tenant role (including a plain 'employee' with no
// relation to the booking) could view/download any booking's
// attachments in the company. Now an 'employee'-role caller may only
// view attachments for a booking assigned to THEM
// (Employee.userId -> TenantUser link). owner/admin/manager keep full
// visibility, matching the existing write-side role gate
// (canManageAttachments in bookingAttachmentRoutes.ts).

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/bookingRepository.js', () => ({
  bookingRepository: { findByIdInCompany: vi.fn() },
}));
vi.mock('../../repositories/employeeRepository.js', () => ({
  employeeRepository: { findByUserIdInCompany: vi.fn() },
}));
vi.mock('../../services/bookingAttachmentService.instance.js', () => ({
  bookingAttachmentService: {
    listForBooking: vi.fn(),
    getAttachmentContent: vi.fn(),
  },
}));

import { bookingRepository } from '../../repositories/bookingRepository.js';
import { employeeRepository } from '../../repositories/employeeRepository.js';
import { bookingAttachmentService } from '../../services/bookingAttachmentService.instance.js';
import {
  getBookingAttachmentContent,
  listBookingAttachments,
} from '../bookingAttachmentController.js';

const BOOKING_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439099';
const ASSIGNED_EMPLOYEE_ID = '507f1f77bcf86cd799439022';
const OTHER_EMPLOYEE_ID = '507f1f77bcf86cd799439033';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: { bookingId: BOOKING_ID, attachmentId: ATTACHMENT_ID },
    query: {},
    body: {},
    tenantAuth: { userId: 'user-1', companyId: 'company-1', role: 'employee' },
    ...overrides,
  } as unknown as Request;
}

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
      setHeader() {
        return this;
      },
      send(body: unknown) {
        resolve({ status: statusCode, body });
      },
    } as unknown as Response;
    const next = ((err?: unknown) => {
      if (err) resolve({ error: err });
    }) as NextFunction;
    handler(req, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bookingRepository.findByIdInCompany).mockResolvedValue({
    employeeId: ASSIGNED_EMPLOYEE_ID,
  } as never);
  vi.mocked(bookingAttachmentService.listForBooking).mockResolvedValue([]);
  vi.mocked(bookingAttachmentService.getAttachmentContent).mockResolvedValue({
    buffer: Buffer.from('fake-image-bytes'),
    mimeType: 'image/jpeg',
  });
});

describe.each([
  ['listBookingAttachments', listBookingAttachments],
  ['getBookingAttachmentContent', getBookingAttachmentContent],
])('%s — attachment view access', (_name, handler) => {
  it('owner can view attachments for ANY booking regardless of employee assignment', async () => {
    const result = await invokeHandler(
      handler,
      buildReq({ tenantAuth: { userId: 'owner-1', companyId: 'company-1', role: 'owner' } }),
    );

    expect('error' in result).toBe(false);
    expect(employeeRepository.findByUserIdInCompany).not.toHaveBeenCalled();
  });

  it('admin can view attachments for ANY booking', async () => {
    const result = await invokeHandler(
      handler,
      buildReq({ tenantAuth: { userId: 'admin-1', companyId: 'company-1', role: 'admin' } }),
    );
    expect('error' in result).toBe(false);
  });

  it('manager can view attachments for ANY booking', async () => {
    const result = await invokeHandler(
      handler,
      buildReq({ tenantAuth: { userId: 'manager-1', companyId: 'company-1', role: 'manager' } }),
    );
    expect('error' in result).toBe(false);
  });

  it('an employee assigned to the booking CAN view its attachments', async () => {
    vi.mocked(employeeRepository.findByUserIdInCompany).mockResolvedValue({
      _id: ASSIGNED_EMPLOYEE_ID,
    } as never);

    const result = await invokeHandler(handler, buildReq());

    expect('error' in result).toBe(false);
  });

  it('an employee NOT assigned to the booking is FORBIDDEN', async () => {
    vi.mocked(employeeRepository.findByUserIdInCompany).mockResolvedValue({
      _id: OTHER_EMPLOYEE_ID,
    } as never);

    const result = await invokeHandler(handler, buildReq());

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('FORBIDDEN');
    }
  });

  it('a caller with NO linked Employee roster entry at all is FORBIDDEN (not treated as "no restriction")', async () => {
    vi.mocked(employeeRepository.findByUserIdInCompany).mockResolvedValue(null);

    const result = await invokeHandler(handler, buildReq());

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('FORBIDDEN');
    }
  });

  it('a nonexistent booking is NotFound before any access check runs', async () => {
    vi.mocked(bookingRepository.findByIdInCompany).mockResolvedValue(null);

    const result = await invokeHandler(handler, buildReq());

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
    expect(employeeRepository.findByUserIdInCompany).not.toHaveBeenCalled();
  });
});
