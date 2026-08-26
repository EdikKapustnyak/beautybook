import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { list: vi.fn() },
}));

import { auditLogRepository } from '../../repositories/auditLogRepository.js';
import { listAuditLogs } from '../auditLogController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, params: {}, query: {}, body: {}, ...overrides } as unknown as Request;
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

describe('listAuditLogs', () => {
  it('passes filters and pagination through to the repository', async () => {
    vi.mocked(auditLogRepository.list).mockResolvedValue({ items: [], total: 0 });

    const result = await invokeHandler(
      listAuditLogs,
      buildReq({ query: { page: '2', limit: '10', action: 'company.status_changed' } }),
    );

    expect('error' in result).toBe(false);
    expect(auditLogRepository.list).toHaveBeenCalledWith(
      { action: 'company.status_changed' },
      { page: 2, limit: 10 },
    );
  });
});
