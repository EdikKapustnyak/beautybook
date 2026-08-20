import type { ReminderSchedulerPort } from '../../tenant/services/reminderSchedulerPort.js';
import { computeReminderTimes } from '../../tenant/services/reminderTiming.js';
import { remindersQueue } from './queues.js';

export interface ReminderJobData {
  companyId: string;
  bookingId: string;
  type: 'reminder_24h' | 'reminder_2h';
}

// BullMQ v6 rejects custom job ids containing ':' ("Custom Id cannot
// contain :") — caught by live verification against a real Redis/BullMQ
// instance (unit tests with in-memory fakes had no way to catch this,
// since the fakes don't replicate BullMQ's own job-id validation). Using
// '-' as the separator instead.
function reminder24hJobId(bookingId: string): string {
  return `reminder-24h-${bookingId}`;
}
function reminder2hJobId(bookingId: string): string {
  return `reminder-2h-${bookingId}`;
}

export const bullmqReminderScheduler: ReminderSchedulerPort = {
  async scheduleReminders({ companyId, bookingId, startAt }) {
    const { reminder24hAt, reminder2hAt } = computeReminderTimes(startAt);
    const now = Date.now();

    if (reminder24hAt) {
      const data: ReminderJobData = { companyId, bookingId, type: 'reminder_24h' };
      await remindersQueue.add('reminder', data, {
        jobId: reminder24hJobId(bookingId),
        delay: Math.max(0, reminder24hAt.getTime() - now),
      });
    }
    if (reminder2hAt) {
      const data: ReminderJobData = { companyId, bookingId, type: 'reminder_2h' };
      await remindersQueue.add('reminder', data, {
        jobId: reminder2hJobId(bookingId),
        delay: Math.max(0, reminder2hAt.getTime() - now),
      });
    }
  },

  async cancelReminders(bookingId) {
    await Promise.all([
      remindersQueue.remove(reminder24hJobId(bookingId)),
      remindersQueue.remove(reminder2hJobId(bookingId)),
    ]);
  },
};
