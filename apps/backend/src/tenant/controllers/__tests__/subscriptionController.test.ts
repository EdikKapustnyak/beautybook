// apps/backend/src/tenant/controllers/__tests__/subscriptionController.test.ts

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/userRepository.js', () => ({
  userRepository: { findByIdInCompany: vi.fn() },
}));
vi.mock('../../services/subscriptionService.instance.js', () => ({
  subscriptionService: {
    getSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
  },
}));

import { userRepository } from '../../repositories/userRepository.js';
import { subscriptionService } from '../../services/subscriptionService.instance.js';
import { createCheckoutSession, getSubscription } from '../subscriptionController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    tenantAuth: { userId: 'user-1', companyId: 'company-1', role: 'owner' },
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

describe('getSubscription', () => {
  it("returns the caller's own company subscription", async () => {
    vi.mocked(subscriptionService.getSubscription).mockResolvedValue({
      id: 'sub-1',
      companyId: 'company-1',
      stripeCustomerId: 'cus_1',
      plan: 'starter',
      status: 'active',
      cancelAtPeriodEnd: false,
    } as never);

    const result = await invokeHandler(getSubscription, buildReq());

    expect('error' in result).toBe(false);
    expect(subscriptionService.getSubscription).toHaveBeenCalledWith('company-1');
  });

  it('returns null cleanly when the company has never subscribed', async () => {
    vi.mocked(subscriptionService.getSubscription).mockResolvedValue(null);

    const result = await invokeHandler(getSubscription, buildReq());

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.body).toEqual({ success: true, data: { subscription: null } });
    }
  });
});

describe('createCheckoutSession', () => {
  it('looks up the requester and forwards their email/name to the service', async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue({
      id: 'user-1',
      email: 'owner@glowstudio.no',
      name: 'Owner Ownerson',
    } as never);
    vi.mocked(subscriptionService.createCheckoutSession).mockResolvedValue({
      url: 'https://checkout.stripe.com/test/abc',
    });

    const result = await invokeHandler(
      createCheckoutSession,
      buildReq({ body: { plan: 'starter' } }),
    );

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.body).toEqual({
        success: true,
        data: { checkoutUrl: 'https://checkout.stripe.com/test/abc' },
      });
    }
    expect(subscriptionService.createCheckoutSession).toHaveBeenCalledWith({
      companyId: 'company-1',
      plan: 'starter',
      requesterEmail: 'owner@glowstudio.no',
      requesterName: 'Owner Ownerson',
    });
  });

  it('rejects an invalid plan value before touching the service', async () => {
    const result = await invokeHandler(
      createCheckoutSession,
      buildReq({ body: { plan: 'enterprise' } }),
    );

    expect('error' in result).toBe(true);
    expect(subscriptionService.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('404s if the requester somehow no longer exists (defense in depth)', async () => {
    vi.mocked(userRepository.findByIdInCompany).mockResolvedValue(null);

    const result = await invokeHandler(
      createCheckoutSession,
      buildReq({ body: { plan: 'starter' } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
    expect(subscriptionService.createCheckoutSession).not.toHaveBeenCalled();
  });
});
