import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/supportTicketRepository.js', () => ({
  supportTicketRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { supportTicketRepository } from '../../repositories/supportTicketRepository.js';
import { createTicket, getTicket, listTickets, updateTicket } from '../supportTicketController.js';

const VALID_TICKET_ID = '507f1f77bcf86cd799439011';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    adminAuth: { adminUserId: 'admin-1', role: 'support' },
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
    } as unknown as Response;
    const next = ((err?: unknown) => {
      if (err) resolve({ error: err });
    }) as NextFunction;
    handler(req, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTickets', () => {
  it('passes filters and pagination through', async () => {
    vi.mocked(supportTicketRepository.list).mockResolvedValue({ items: [], total: 0 });

    const result = await invokeHandler(
      listTickets,
      buildReq({ query: { status: 'open', page: '2', limit: '10' } }),
    );

    expect('error' in result).toBe(false);
    expect(supportTicketRepository.list).toHaveBeenCalledWith(
      { status: 'open' },
      { page: 2, limit: 10 },
    );
  });
});

describe('getTicket', () => {
  it('returns 404 for an unknown ticket', async () => {
    vi.mocked(supportTicketRepository.findById).mockResolvedValue(null);

    const result = await invokeHandler(
      getTicket,
      buildReq({ params: { ticketId: VALID_TICKET_ID } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});

describe('createTicket', () => {
  it('creates a ticket and records an audit log entry', async () => {
    vi.mocked(supportTicketRepository.create).mockResolvedValue({
      _id: VALID_TICKET_ID,
      subject: 'X',
    } as never);

    const result = await invokeHandler(
      createTicket,
      buildReq({ body: { subject: 'X', description: 'Y' } }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.status).toBe(201);
    }
  });

  it('rejects an invalid body before touching the repository', async () => {
    const result = await invokeHandler(createTicket, buildReq({ body: { subject: '' } }));

    expect('error' in result).toBe(true);
    expect(supportTicketRepository.create).not.toHaveBeenCalled();
  });
});

describe('updateTicket', () => {
  it('updates status and returns the ticket', async () => {
    vi.mocked(supportTicketRepository.update).mockResolvedValue({ status: 'closed' } as never);

    const result = await invokeHandler(
      updateTicket,
      buildReq({ params: { ticketId: VALID_TICKET_ID }, body: { status: 'closed' } }),
    );

    expect('error' in result).toBe(false);
    expect(supportTicketRepository.update).toHaveBeenCalledWith(VALID_TICKET_ID, {
      status: 'closed',
    });
  });

  it('returns 404 for an unknown ticket', async () => {
    vi.mocked(supportTicketRepository.update).mockResolvedValue(null);

    const result = await invokeHandler(
      updateTicket,
      buildReq({ params: { ticketId: VALID_TICKET_ID }, body: { status: 'closed' } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});
