import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/billing/adapters.js', () => ({
  mongoDiscountCodeRepositoryPort: {
    list: vi.fn(),
    findByCode: vi.fn(),
    create: vi.fn(),
    setActive: vi.fn(),
  },
}));
vi.mock('../../../shared/payments/stripeGateway.instance.js', () => ({
  stripeGateway: { createPromotionCode: vi.fn() },
}));
vi.mock('../../repositories/auditLogRepository.js', () => ({
  auditLogRepository: { record: vi.fn() },
}));

import { mongoDiscountCodeRepositoryPort } from '../../../shared/billing/adapters.js';
import { stripeGateway } from '../../../shared/payments/stripeGateway.instance.js';
import {
  createDiscountCode,
  listDiscountCodes,
  setDiscountCodeActive,
} from '../discountCodeController.js';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    adminAuth: { adminUserId: 'admin-1', role: 'superadmin' },
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

const EXISTING_CODE = {
  code: 'SUMMER15',
  percentOff: 15,
  appliesToPlans: [],
  active: true,
  stripeCouponId: 'coupon_1',
  stripePromotionCodeId: 'promo_1',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listDiscountCodes', () => {
  it('returns all codes', async () => {
    vi.mocked(mongoDiscountCodeRepositoryPort.list).mockResolvedValue([EXISTING_CODE]);

    const result = await invokeHandler(listDiscountCodes, buildReq());

    expect('error' in result).toBe(false);
  });
});

describe('createDiscountCode', () => {
  it('creates a real Stripe Coupon+PromotionCode and stores the local record', async () => {
    vi.mocked(mongoDiscountCodeRepositoryPort.findByCode).mockResolvedValue(null);
    vi.mocked(stripeGateway.createPromotionCode).mockResolvedValue({
      stripeCouponId: 'coupon_new',
      stripePromotionCodeId: 'promo_new',
    });
    vi.mocked(mongoDiscountCodeRepositoryPort.create).mockResolvedValue({
      ...EXISTING_CODE,
      code: 'WINTER20',
      percentOff: 20,
      stripeCouponId: 'coupon_new',
      stripePromotionCodeId: 'promo_new',
    });

    const result = await invokeHandler(
      createDiscountCode,
      buildReq({ body: { code: 'winter20', percentOff: 20 } }),
    );

    expect('error' in result).toBe(false);
    expect(stripeGateway.createPromotionCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WINTER20', percentOff: 20 }),
    );
    expect(mongoDiscountCodeRepositoryPort.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'WINTER20',
        stripeCouponId: 'coupon_new',
        stripePromotionCodeId: 'promo_new',
      }),
    );
  });

  it('rejects a duplicate code without calling Stripe', async () => {
    vi.mocked(mongoDiscountCodeRepositoryPort.findByCode).mockResolvedValue(EXISTING_CODE);

    const result = await invokeHandler(
      createDiscountCode,
      buildReq({ body: { code: 'summer15', percentOff: 15 } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('CONFLICT');
    }
    expect(stripeGateway.createPromotionCode).not.toHaveBeenCalled();
  });

  it('rejects an invalid body before touching Stripe or the repository', async () => {
    const result = await invokeHandler(
      createDiscountCode,
      buildReq({ body: { code: 'x', percentOff: 999 } }),
    );

    expect('error' in result).toBe(true);
    expect(mongoDiscountCodeRepositoryPort.findByCode).not.toHaveBeenCalled();
    expect(stripeGateway.createPromotionCode).not.toHaveBeenCalled();
  });
});

describe('setDiscountCodeActive', () => {
  it('deactivates a code', async () => {
    vi.mocked(mongoDiscountCodeRepositoryPort.setActive).mockResolvedValue({
      ...EXISTING_CODE,
      active: false,
    });

    const result = await invokeHandler(
      setDiscountCodeActive,
      buildReq({ params: { code: 'SUMMER15' }, body: { active: false } }),
    );

    expect('error' in result).toBe(false);
    expect(mongoDiscountCodeRepositoryPort.setActive).toHaveBeenCalledWith('SUMMER15', false);
  });

  it('returns 404 for an unknown code', async () => {
    vi.mocked(mongoDiscountCodeRepositoryPort.setActive).mockResolvedValue(null);

    const result = await invokeHandler(
      setDiscountCodeActive,
      buildReq({ params: { code: 'GHOST' }, body: { active: false } }),
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect((result.error as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});
