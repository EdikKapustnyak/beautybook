import type { ReminderSchedulerPort } from '../reminderSchedulerPort.js';

export interface ScheduledCall {
  companyId: string;
  bookingId: string;
  startAt: Date;
}

export interface InMemoryReminderScheduler extends ReminderSchedulerPort {
  scheduled: ScheduledCall[];
  cancelled: string[];
}

export function createInMemoryReminderScheduler(): InMemoryReminderScheduler {
  const scheduled: ScheduledCall[] = [];
  const cancelled: string[] = [];

  return {
    scheduled,
    cancelled,
    async scheduleReminders(input) {
      scheduled.push(input);
    },
    async cancelReminders(bookingId) {
      cancelled.push(bookingId);
    },
  };
}

/** Always throws — for testing that a scheduler outage never breaks booking creation/cancellation/reschedule. */
export function createThrowingReminderScheduler(): ReminderSchedulerPort {
  return {
    async scheduleReminders() {
      throw new Error('reminder scheduler unavailable');
    },
    async cancelReminders() {
      throw new Error('reminder scheduler unavailable');
    },
  };
}
