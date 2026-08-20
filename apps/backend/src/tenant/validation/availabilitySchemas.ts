import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');

// dev-tasks.md §18 "Availability Abuse" — a single request is scoped to
// one calendar date. Multi-day/range browsing is a client-side concern
// (call this once per date the UI needs), which keeps each request's
// slot-generation cost bounded regardless of how far into the future
// someone asks.
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const getAvailabilityQuerySchema = z.object({
  employeeId: objectIdSchema,
  serviceId: objectIdSchema,
  date: z.string().regex(isoDatePattern, 'date must be in "YYYY-MM-DD" format.'),
});
export type GetAvailabilityQuery = z.infer<typeof getAvailabilityQuerySchema>;
