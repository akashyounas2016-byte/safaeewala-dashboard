import type { Employee } from '@/types'

/**
 * R-EMP-07: an Excel import fills the empty fields of an employee who is already on the list
 * (e.g. a cleaner saved from the Daily Job Sheet with only a name). A field that already has a
 * value is never overwritten; the import never invents a value.
 */
export const IMPORT_FILL_FIELDS = [
  'phone', 'email', 'nationality', 'emirates_id', 'pay_rate_hourly', 'monthly_salary',
  'visa_expiry', 'work_permit_expiry', 'passport_expiry', 'end_date', 'agency_name',
] as const

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || v === 0

/** The fields to write onto `existing` from an imported row — empty when nothing new */
export function blankFieldsFromImport(existing: Partial<Employee>, imported: Partial<Employee>): Partial<Employee> {
  const patch: Record<string, unknown> = {}
  for (const k of IMPORT_FILL_FIELDS) {
    const next = imported[k]
    if (isBlank(existing[k]) && !isBlank(next)) patch[k] = next
  }
  return patch as Partial<Employee>
}
