// apps/backend/src/admin/services/usageService.ts

import { companyAdminRepository } from '../repositories/companyAdminRepository.js';
import {
  usageAdminRepository,
  type CompanyUsageRow,
  type DailyBookingsPoint,
} from '../repositories/usageAdminRepository.js';

export interface UsageOverviewRow extends CompanyUsageRow {
  companyName: string | null;
}

export interface UsageOverview {
  windowDays: number;
  totalBookings: number;
  totalSms: number;
  totalStorageBytes: number;
  dailyBookings: DailyBookingsPoint[];
  companies: UsageOverviewRow[];
}

export async function computeUsageOverview(windowDays: number): Promise<UsageOverview> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [perCompany, dailyBookings] = await Promise.all([
    usageAdminRepository.getUsagePerCompany(since),
    usageAdminRepository.getDailyBookingsSeries(since),
  ]);

  // Resolved in their own pass before mapping — see
  // subscriptionsOverviewService.ts's header comment for why a lazy,
  // per-row lookup inside a concurrent map is the wrong pattern here
  // (a real race this codebase already hit once).
  const uniqueCompanyIds = [...new Set(perCompany.map((row) => row.companyId))];
  const companyNameById = new Map<string, string | null>();
  await Promise.all(
    uniqueCompanyIds.map(async (companyId) => {
      const company = await companyAdminRepository.findById(companyId);
      companyNameById.set(companyId, company?.name ?? null);
    }),
  );

  const companies = perCompany.map((row) => ({
    ...row,
    companyName: companyNameById.get(row.companyId) ?? null,
  }));

  return {
    windowDays,
    totalBookings: companies.reduce((sum, row) => sum + row.bookingsCount, 0),
    totalSms: companies.reduce((sum, row) => sum + row.smsCount, 0),
    totalStorageBytes: companies.reduce((sum, row) => sum + row.storageBytes, 0),
    dailyBookings,
    companies,
  };
}
