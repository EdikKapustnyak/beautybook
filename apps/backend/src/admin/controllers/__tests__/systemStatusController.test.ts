import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/systemStatusService.js', () => ({
  computeSystemStatus: vi.fn(),
}));

import { computeSystemStatus } from '../../services/systemStatusService.js';
import { getSystemStatus } from '../systemStatusController.js';

function invokeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
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
    handler({} as Request, res, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSystemStatus', () => {
  it('returns the computed system status', async () => {
    vi.mocked(computeSystemStatus).mockResolvedValue({
      services: [{ service: 'MongoDB', status: 'connected' }],
      integrations: [{ name: 'Stripe', configured: true }],
      deployment: { uptimeSeconds: 100, nodeVersion: 'v22.0.0' },
    });

    const result = await invokeHandler(getSystemStatus);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.body).toEqual({
        success: true,
        data: {
          status: {
            services: [{ service: 'MongoDB', status: 'connected' }],
            integrations: [{ name: 'Stripe', configured: true }],
            deployment: { uptimeSeconds: 100, nodeVersion: 'v22.0.0' },
          },
        },
      });
    }
  });
});
