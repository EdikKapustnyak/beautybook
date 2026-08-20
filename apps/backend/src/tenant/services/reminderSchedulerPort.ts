export interface ReminderSchedulerPort {
  /**
   * Schedules (or, if called again for the same bookingId, REPLACES) the
   * 24h/2h reminder jobs for a booking. Implementations use deterministic
   * job ids per booking (e.g. `reminder-24h:<bookingId>`) so re-scheduling
   * after a reschedule is just cancel-then-add, never a growing pile of
   * stale jobs.
   */
  scheduleReminders(input: { companyId: string; bookingId: string; startAt: Date }): Promise<void>;
  /** Cancels any pending reminder jobs for a booking — called on cancel/no_show. Safe to call even if none are pending. */
  cancelReminders(bookingId: string): Promise<void>;
}
