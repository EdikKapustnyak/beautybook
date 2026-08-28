// apps/backend/src/admin/repositories/__tests__/usageAdminRepository.test.ts
//
// Same reasoning as companyAdminRepository.test.ts: registers minimal,
// LOCAL models under the shared Mongoose registry keys rather than
// importing tenant/models/*.ts directly.

import mongoose, { Schema } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  if (!mongoose.models.Booking) {
    mongoose.model(
      'Booking',
      new Schema({ companyId: Schema.Types.ObjectId }, { timestamps: true }),
    );
  }
  if (!mongoose.models.Notification) {
    mongoose.model(
      'Notification',
      new Schema({ companyId: Schema.Types.ObjectId, channel: String }, { timestamps: true }),
    );
  }
  if (!mongoose.models.BookingAttachment) {
    mongoose.model(
      'BookingAttachment',
      new Schema({ companyId: Schema.Types.ObjectId, sizeBytes: Number, status: String }),
    );
  }
  if (!mongoose.models.PortfolioImage) {
    mongoose.model(
      'PortfolioImage',
      new Schema({ companyId: Schema.Types.ObjectId, sizeBytes: Number, active: Boolean }),
    );
  }
});

describe('usageAdminRepository.getUsagePerCompany', () => {
  it('combines bookings/SMS counts and storage bytes per company', async () => {
    const companyId = new mongoose.Types.ObjectId();
    const BookingModel = mongoose.model('Booking');
    const NotificationModel = mongoose.model('Notification');
    const BookingAttachmentModel = mongoose.model('BookingAttachment');
    const PortfolioImageModel = mongoose.model('PortfolioImage');

    const bookingAggSpy = vi
      .spyOn(BookingModel, 'aggregate')
      .mockResolvedValue([{ _id: companyId, count: 5 }] as never);
    const notificationAggSpy = vi
      .spyOn(NotificationModel, 'aggregate')
      .mockResolvedValue([{ _id: companyId, count: 3 }] as never);
    const attachmentAggSpy = vi
      .spyOn(BookingAttachmentModel, 'aggregate')
      .mockResolvedValue([{ _id: companyId, bytes: 1000 }] as never);
    const portfolioAggSpy = vi
      .spyOn(PortfolioImageModel, 'aggregate')
      .mockResolvedValue([{ _id: companyId, bytes: 2000 }] as never);

    const { usageAdminRepository } = await import('../usageAdminRepository.js');
    const result = await usageAdminRepository.getUsagePerCompany(new Date('2026-01-01'));

    expect(result).toEqual([
      {
        companyId: String(companyId),
        bookingsCount: 5,
        smsCount: 3,
        storageBytes: 3000, // 1000 + 2000
      },
    ]);

    bookingAggSpy.mockRestore();
    notificationAggSpy.mockRestore();
    attachmentAggSpy.mockRestore();
    portfolioAggSpy.mockRestore();
  });

  it('returns an empty array when no company has any usage', async () => {
    const BookingModel = mongoose.model('Booking');
    const NotificationModel = mongoose.model('Notification');
    const BookingAttachmentModel = mongoose.model('BookingAttachment');
    const PortfolioImageModel = mongoose.model('PortfolioImage');

    const bookingAggSpy = vi.spyOn(BookingModel, 'aggregate').mockResolvedValue([] as never);
    const notificationAggSpy = vi
      .spyOn(NotificationModel, 'aggregate')
      .mockResolvedValue([] as never);
    const attachmentAggSpy = vi
      .spyOn(BookingAttachmentModel, 'aggregate')
      .mockResolvedValue([] as never);
    const portfolioAggSpy = vi
      .spyOn(PortfolioImageModel, 'aggregate')
      .mockResolvedValue([] as never);

    const { usageAdminRepository } = await import('../usageAdminRepository.js');
    const result = await usageAdminRepository.getUsagePerCompany(new Date());

    expect(result).toEqual([]);

    bookingAggSpy.mockRestore();
    notificationAggSpy.mockRestore();
    attachmentAggSpy.mockRestore();
    portfolioAggSpy.mockRestore();
  });
});

describe('usageAdminRepository.getDailyBookingsSeries', () => {
  it('maps aggregation results to date/count points', async () => {
    const BookingModel = mongoose.model('Booking');
    const aggSpy = vi.spyOn(BookingModel, 'aggregate').mockResolvedValue([
      { _id: '2026-01-01', count: 4 },
      { _id: '2026-01-02', count: 7 },
    ] as never);

    const { usageAdminRepository } = await import('../usageAdminRepository.js');
    const result = await usageAdminRepository.getDailyBookingsSeries(new Date('2026-01-01'));

    expect(result).toEqual([
      { date: '2026-01-01', count: 4 },
      { date: '2026-01-02', count: 7 },
    ]);
    aggSpy.mockRestore();
  });
});
