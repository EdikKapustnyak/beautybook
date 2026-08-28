import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/usageAdminRepository.js', () => ({
  usageAdminRepository: { getUsagePerCompany: vi.fn(), getDailyBookingsSeries: vi.fn() },
}));
vi.mock('../../repositories/companyAdminRepository.js', () => ({
  companyAdminRepository: { findById: vi.fn() },
}));

import { companyAdminRepository } from '../../repositories/companyAdminRepository.js';
import { usageAdminRepository } from '../../repositories/usageAdminRepository.js';
import { computeUsageOverview } from '../usageService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeUsageOverview', () => {
  it('joins company names and computes totals', async () => {
    vi.mocked(usageAdminRepository.getUsagePerCompany).mockResolvedValue([
      { companyId: 'company-1', bookingsCount: 5, smsCount: 3, storageBytes: 1000 },
      { companyId: 'company-2', bookingsCount: 2, smsCount: 1, storageBytes: 500 },
    ]);
    vi.mocked(usageAdminRepository.getDailyBookingsSeries).mockResolvedValue([
      { date: '2026-01-01', count: 4 },
    ]);
    vi.mocked(companyAdminRepository.findById).mockImplementation(async (id) => ({
      id,
      name: id === 'company-1' ? 'Glow Studio' : 'Hair Loft',
      slug: 'x',
      status: 'active',
      timezone: 'Europe/Oslo',
      currency: 'NOK',
      createdAt: new Date(),
    }));

    const result = await computeUsageOverview(30);

    expect(result.totalBookings).toBe(7);
    expect(result.totalSms).toBe(4);
    expect(result.totalStorageBytes).toBe(1500);
    expect(result.dailyBookings).toEqual([{ date: '2026-01-01', count: 4 }]);
    expect(result.companies).toEqual([
      {
        companyId: 'company-1',
        bookingsCount: 5,
        smsCount: 3,
        storageBytes: 1000,
        companyName: 'Glow Studio',
      },
      {
        companyId: 'company-2',
        bookingsCount: 2,
        smsCount: 1,
        storageBytes: 500,
        companyName: 'Hair Loft',
      },
    ]);
  });

  it('reports null companyName for an orphaned companyId', async () => {
    vi.mocked(usageAdminRepository.getUsagePerCompany).mockResolvedValue([
      { companyId: 'ghost', bookingsCount: 1, smsCount: 0, storageBytes: 0 },
    ]);
    vi.mocked(usageAdminRepository.getDailyBookingsSeries).mockResolvedValue([]);
    vi.mocked(companyAdminRepository.findById).mockResolvedValue(null);

    const result = await computeUsageOverview(30);

    expect(result.companies[0]?.companyName).toBeNull();
  });

  it('returns zero totals when no company has any usage', async () => {
    vi.mocked(usageAdminRepository.getUsagePerCompany).mockResolvedValue([]);
    vi.mocked(usageAdminRepository.getDailyBookingsSeries).mockResolvedValue([]);

    const result = await computeUsageOverview(7);

    expect(result).toMatchObject({
      windowDays: 7,
      totalBookings: 0,
      totalSms: 0,
      totalStorageBytes: 0,
      companies: [],
    });
  });
});
