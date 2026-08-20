/**
 * One-off CLI script to run the temporary booking-attachment cleanup job
 * (dev-tasks.md §14). Not yet wired into a scheduler — BullMQ/Redis lands
 * in a later stage (dev-tasks.md §16/§17). Until then, run this manually
 * or via a system cron entry, e.g.:
 *
 *   0 3 * * * cd /path/to/apps/backend && npx tsx src/scripts/cleanupExpiredBookingAttachments.ts
 *
 * Usage:
 *   npx tsx src/scripts/cleanupExpiredBookingAttachments.ts
 */
import { connectDB, disconnectDB } from '../db/connection.js';
import { bookingAttachmentService } from '../tenant/services/bookingAttachmentService.instance.js';

const BATCH_SIZE = 100;

async function main(): Promise<void> {
  await connectDB();

  let totalDeleted = 0;
  let totalFailed = 0;

  // Loop until a batch comes back with nothing expired left to process —
  // findExpired always re-queries "active AND past retention", so
  // repeatedly draining full batches handles more than BATCH_SIZE expired
  // records in one run without loading them all into memory at once.
  for (;;) {
    const { deletedCount, failedCount } =
      await bookingAttachmentService.cleanupExpiredAttachments(BATCH_SIZE);
    totalDeleted += deletedCount;
    totalFailed += failedCount;

    if (deletedCount + failedCount < BATCH_SIZE) {
      break;
    }
  }

  // eslint-disable-next-line no-console -- CLI script, stdout summary is the point
  console.log(
    `Booking attachment cleanup complete: ${totalDeleted} deleted, ${totalFailed} failed (will retry next run).`,
  );

  await disconnectDB();
}

main().catch((error: unknown) => {
  console.error('Booking attachment cleanup failed:', error);
  process.exit(1);
});
