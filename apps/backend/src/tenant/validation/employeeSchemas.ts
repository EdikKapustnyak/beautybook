import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { paginationQuerySchema } from '../../shared/validation/pagination.js';
import {
  getWeeklyScheduleError,
  isValidTimeFormat,
  WEEKDAYS,
} from '../../shared/validation/workingHours.js';

const objectIdSchema = z.string().refine(isValidObjectId, 'Must be a valid id.');

const timeSchema = z.string().refine(isValidTimeFormat, 'Must use 24h "HH:mm" format.');

const timeRangeSchema = z.object({ start: timeSchema, end: timeSchema }).strict();

const workingPeriodSchema = z
  .object({
    start: timeSchema,
    end: timeSchema,
    breaks: z.array(timeRangeSchema).max(20).optional(),
  })
  .strict();

// Always a FULL REPLACE of the week, never a per-day patch — see
// employee.model.ts. Every day key is independently optional; an omitted
// day simply has no working periods (day off).
const weeklyScheduleSchema = z
  .object(
    Object.fromEntries(
      WEEKDAYS.map((day) => [day, z.array(workingPeriodSchema).max(10).optional()]),
    ),
  )
  .strict()
  .refine(
    (schedule) => getWeeklyScheduleError(schedule) === null,
    (schedule) => ({
      message: getWeeklyScheduleError(schedule) ?? 'workingHours is invalid.',
    }),
  );

export const createEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    phone: z.string().trim().min(6).max(32).optional(),
    serviceIds: z.array(objectIdSchema).max(200).optional(),
    workingHours: weeklyScheduleSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
