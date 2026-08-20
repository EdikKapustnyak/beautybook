import { bullmqReminderScheduler } from '../../shared/queue/reminderScheduler.js';
import {
  mongoBookingRepositoryPort,
  mongoCustomerRepositoryPort,
  mongoSlotLockRepositoryPort,
} from '../repositories/bookingRepositoryAdapters.js';
import { createBookingService } from './bookingService.js';

export const bookingService = createBookingService({
  bookingRepo: mongoBookingRepositoryPort,
  slotLockRepo: mongoSlotLockRepositoryPort,
  customerRepo: mongoCustomerRepositoryPort,
  reminderScheduler: bullmqReminderScheduler,
});
