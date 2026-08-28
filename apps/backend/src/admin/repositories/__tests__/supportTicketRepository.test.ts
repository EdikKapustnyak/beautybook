import { describe, expect, it, vi } from 'vitest';

import { SupportTicketModel } from '../../models/supportTicket.model.js';
import { supportTicketRepository } from '../supportTicketRepository.js';

describe('supportTicketRepository.list', () => {
  it('applies status/priority filters and paginates', async () => {
    const findSpy = vi.spyOn(SupportTicketModel, 'find').mockReturnValue({
      sort: () => ({
        skip: (skip: number) => ({
          limit: (limit: number) => {
            expect(skip).toBe(10);
            expect(limit).toBe(5);
            return { exec: async () => [] };
          },
        }),
      }),
    } as unknown as ReturnType<typeof SupportTicketModel.find>);
    const countSpy = vi
      .spyOn(SupportTicketModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 12 } as ReturnType<
        typeof SupportTicketModel.countDocuments
      >);

    const result = await supportTicketRepository.list(
      { status: 'open', priority: 'high' },
      { page: 3, limit: 5 },
    );

    expect(findSpy).toHaveBeenCalledWith({ status: 'open', priority: 'high' });
    expect(result.total).toBe(12);

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('applies no filter when none provided', async () => {
    const findSpy = vi.spyOn(SupportTicketModel, 'find').mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    } as unknown as ReturnType<typeof SupportTicketModel.find>);
    const countSpy = vi
      .spyOn(SupportTicketModel, 'countDocuments')
      .mockReturnValue({ exec: async () => 0 } as ReturnType<
        typeof SupportTicketModel.countDocuments
      >);

    await supportTicketRepository.list({}, { page: 1, limit: 20 });

    expect(findSpy).toHaveBeenCalledWith({});

    findSpy.mockRestore();
    countSpy.mockRestore();
  });
});

describe('supportTicketRepository.update', () => {
  it('writes $set with the given updates', async () => {
    const updateSpy = vi.spyOn(SupportTicketModel, 'findByIdAndUpdate').mockReturnValue({
      exec: async () => ({ status: 'resolved' }),
    } as ReturnType<typeof SupportTicketModel.findByIdAndUpdate>);

    await supportTicketRepository.update('ticket-1', { status: 'resolved' });

    expect(updateSpy).toHaveBeenCalledWith(
      'ticket-1',
      { $set: { status: 'resolved' } },
      { new: true },
    );
    updateSpy.mockRestore();
  });
});
