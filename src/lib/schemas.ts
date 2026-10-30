import { z } from 'zod'

/**
 * One set of data rules per record type (TA-19). Used where data enters the system in bulk
 * (Excel import) and by the forms' helpers; the database constraints in
 * 2026-11-01_data_constraints.sql mirror the same limits (TA-20).
 */

export const PAYMENT_MODES = ['Cash', 'Online', 'Pending', 'Monthly', 'Above'] as const
const time = z.string().regex(/^$|^—$|^\d{1,2}:\d{2}(\s?(AM|PM))?$/i, 'Time must look like 09:00 or 9:00 AM')
const money = z.number().min(0, 'Cannot be negative').max(100_000, 'Too large — check the amount')

export const dailyJobSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  staff_name: z.string().trim().min(1, 'Staff name is missing'),
  start_time: time,
  end_time: time,
  duty_hours: z.number().min(0).max(24, 'More than 24 duty hours'),
  ot_hours: z.number().min(0).max(24).optional(),
  address: z.string(),
  charges: money,
  received: money,
  payment_mode: z.enum(PAYMENT_MODES, { message: `Payment mode must be one of ${PAYMENT_MODES.join(', ')}` }),
})

export const clientSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is missing'),
  phone: z.string().trim().max(30),
  email: z.string().trim().email('Check the email').or(z.literal('')).optional(),
  advance_amount: money.optional(),
  pending_amount: money.optional(),
})

export const employeeSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is missing'),
  emirates_id: z.string().regex(/^$|^784-\d{4}-\d{7}-\d$/, 'Emirates ID must be 784-YYYY-NNNNNNN-N').optional(),
  monthly_salary: z.number().min(0).max(100_000).optional(),
})

/** Plain-language problems of one record, or [] when it is valid */
export function problemsOf<T>(schema: z.ZodType<T>, value: unknown): string[] {
  const r = schema.safeParse(value)
  return r.success ? [] : r.error.issues.map(i => `${i.path.join('.') || 'value'}: ${i.message}`)
}
