// apps/backend/src/tenant/controllers/__tests__/stripeWebhookController.test.ts

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/subscriptionService.instance.js', () => ({
  subscriptionService: { handleWebhookEvent: vi.fn() },
}));

import { subscriptionService } from '../../services/subscriptionService.instance.js';
import { stripeWebhook } from '../stripeWebhookController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: Buffer.from('{}'),
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

describe('stripeWebhook', () => {
  it('rejects a request with no Stripe-Signature header WITHOUT calling the service', async () => {
    const result = await invokeHandler(stripeWebhook, buildReq());

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('UNAUTHORIZED');
    }
    expect(subscriptionService.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('forwards the raw body Buffer and signature to the service on success', async () => {
    vi.mocked(subscriptionService.handleWebhookEvent).mockResolvedValue(undefined);
    const rawBody = Buffer.from('{"id":"evt_1"}');

    const result = await invokeHandler(
      stripeWebhook,
      buildReq({ headers: { 'stripe-signature': 't=123,v1=abc' }, body: rawBody }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.status).toBe(200);
    }
    expect(subscriptionService.handleWebhookEvent).toHaveBeenCalledWith(rawBody, 't=123,v1=abc');
  });

  it('propagates a service-level signature-verification failure as an error (not a 200)', async () => {
    const signatureError = Object.assign(new Error('Invalid Stripe webhook signature.'), {
      code: 'UNAUTHORIZED',
    });
    vi.mocked(subscriptionService.handleWebhookEvent).mockRejectedValue(signatureError);

    const result = await invokeHandler(
      stripeWebhook,
      buildReq({ headers: { 'stripe-signature': 'forged' } }),
    );

    expect('error' in result).toBe(true);
  });
});
