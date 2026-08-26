import { describe, expect, it, vi } from 'vitest';

import { SubscriptionModel } from '../subscription.model.js';
import { subscriptionRepository } from '../subscriptionRepository.js';

describe('subscriptionRepository.listAll', () => {
  it('paginates unfiltered, sorted by createdAt descending', async () => {
    const findSpy = vi.spyOn(SubscriptionModel, 'find').mockReturnValue({
      sort: (sortArg: unknown) => {
        expect(sortArg).toEqual({ createdAt: -1 });
        return {
          skip: (skip: number) => ({
            limit: (limit: number) => {
              expect(skip).toBe(20);
              expect(limit).toBe(10);
              return { exec: async () => [] };
            },
          }),
        };
      },
    } as unknown as ReturnType<typeof SubscriptionModel.find>);
    const countSpy = vi
      .spyOn(SubscriptionModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 37 } as ReturnType<
        typeof SubscriptionModel.countDocuments
      >);

    const result = await subscriptionRepository.listAll({ page: 3, limit: 10 });

    expect(findSpy).toHaveBeenCalledWith({});
    expect(countSpy).toHaveBeenCalledWith({});
    expect(result).toEqual({ items: [], total: 37 });

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});
