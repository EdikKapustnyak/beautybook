import { Worker, type Job } from 'bullmq';

import { mongoCompanyRepositoryPort } from '../../tenant/repositories/authRepositoryAdapters.js';
import { bookingRepository } from '../../tenant/repositories/bookingRepository.js';
import { customerRepository } from '../../tenant/repositories/customerRepository.js';
import { serviceRepository } from '../../tenant/repositories/serviceRepository.js';
import { reminderMessage } from '../../tenant/services/messageTemplates.js';
import { notificationService } from '../../tenant/services/notificationService.instance.js';
import { QUEUE_NAMES } from './queues.js';
import { redisConnection } from './redisConnection.js';
import type { ReminderJobData } from './reminderScheduler.js';

const OPEN_BOOKING_STATUSES = ['pending', 'confirmed'];

export function startReminderWorker(): Worker<ReminderJobData> {
  return new Worker<ReminderJobData>(
    QUEUE_NAMES.reminders,
    async (job: Job<ReminderJobData>) => {
      const { companyId, bookingId, type } = job.data;

      const booking = await bookingRepository.findByIdInCompany(bookingId, companyId);
      // Booking was cancelled/completed/no longer exists since this job
      // was scheduled — cancelReminders() should have removed the queued
      // job already, but this is a defense-in-depth guard against any
      // gap between "booking changed" and "job removal actually landed".
      if (!booking || !OPEN_BOOKING_STATUSES.includes(booking.status)) {
        return;
      }

      const [customer, service, company] = await Promise.all([
        customerRepository.findByIdInCompany(String(booking.customerId), companyId),
        serviceRepository.findByIdInCompany(String(booking.serviceId), companyId),
        mongoCompanyRepositoryPort.findById(companyId),
      ]);
      if (!customer || !service || !company) {
        return;
      }

      const body = reminderMessage({
        companyName: company.name,
        serviceName: service.name,
        startAt: booking.startAt,
        timezone: company.timezone,
        hoursBefore: type === 'reminder_24h' ? 24 : 2,
      });

      const notification = await notificationService.enqueue(companyId, {
        bookingId,
        type,
        recipient: customer.phone,
        body,
        // Deterministic dedupeKey — a duplicate BullMQ delivery of the
        // SAME job just re-resolves to the same Notification record
        // (findOrCreate), and notificationService.send()'s claim guard
        // handles the rest. See notificationService.ts.
        dedupeKey: `${bookingId}:${type}`,
        scheduledAt: new Date(),
      });

      await notificationService.send(notification.id);
    },
    { connection: redisConnection },
  );
}
