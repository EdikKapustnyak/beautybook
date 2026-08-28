// apps/backend/src/admin/repositories/usageAdminRepository.ts
//
// Same "retrieve the already-registered Mongoose model by name" pattern
// as companyAdminRepository.ts/userAdminRepository.ts (see either
// file's header for the full reasoning — eslint.config.js forbids
// admin/** from importing tenant/**).
//
// No new tracking infrastructure needed: "usage" is computed on read
// from data these collections already record (Booking.createdAt,
// Notification.channel, BookingAttachment/PortfolioImage.sizeBytes) —
// not a separate counters/events pipeline. Good enough for an
// admin-dashboard read; if usage needs to be queried at high frequency
// or very large scale later, that's when a pre-aggregated rollup would
// earn its complexity, not before.

import { model } from 'mongoose';

export interface CompanyUsageRow {
  companyId: string;
  bookingsCount: number;
  smsCount: number;
  storageBytes: number;
}

export interface DailyBookingsPoint {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

function getModel(name: string) {
  return model(name);
}

export const usageAdminRepository = {
  /**
   * Per-company usage for the given window. `bookingsCount`/`smsCount`
   * are windowed (created within [since, now]); `storageBytes` is NOT
   * windowed — storage is a current total, not something that resets
   * per period.
   */
  async getUsagePerCompany(since: Date): Promise<CompanyUsageRow[]> {
    const BookingModel = getModel('Booking');
    const NotificationModel = getModel('Notification');
    const BookingAttachmentModel = getModel('BookingAttachment');
    const PortfolioImageModel = getModel('PortfolioImage');

    const [bookingCounts, smsCounts, attachmentStorage, portfolioStorage] = await Promise.all([
      BookingModel.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } },
      ]),
      NotificationModel.aggregate([
        { $match: { channel: 'sms', createdAt: { $gte: since } } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } },
      ]),
      BookingAttachmentModel.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$companyId', bytes: { $sum: '$sizeBytes' } } },
      ]),
      PortfolioImageModel.aggregate([
        { $match: { active: true } },
        { $group: { _id: '$companyId', bytes: { $sum: '$sizeBytes' } } },
      ]),
    ]);

    const bookingsByCompany = new Map(bookingCounts.map((r) => [String(r._id), r.count as number]));
    const smsByCompany = new Map(smsCounts.map((r) => [String(r._id), r.count as number]));
    const attachmentBytesByCompany = new Map(
      attachmentStorage.map((r) => [String(r._id), r.bytes as number]),
    );
    const portfolioBytesByCompany = new Map(
      portfolioStorage.map((r) => [String(r._id), r.bytes as number]),
    );

    const allCompanyIds = new Set([
      ...bookingsByCompany.keys(),
      ...smsByCompany.keys(),
      ...attachmentBytesByCompany.keys(),
      ...portfolioBytesByCompany.keys(),
    ]);

    return [...allCompanyIds].map((companyId) => ({
      companyId,
      bookingsCount: bookingsByCompany.get(companyId) ?? 0,
      smsCount: smsByCompany.get(companyId) ?? 0,
      storageBytes:
        (attachmentBytesByCompany.get(companyId) ?? 0) +
        (portfolioBytesByCompany.get(companyId) ?? 0),
    }));
  },

  /** Global (all companies) daily booking counts for the last `days` days — the mockup's "Bookings per day" chart. */
  async getDailyBookingsSeries(since: Date): Promise<DailyBookingsPoint[]> {
    const BookingModel = getModel('Booking');
    const results = await BookingModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return results.map((r) => ({ date: r._id as string, count: r.count as number }));
  },
};
