import type { Employee } from '@/types'

/**
 * R-SHEET-02: the Excel Job Sheet lists cleaners only. CSR, drivers and technical staff are employees
 * but are not offered there (no empty rows, no staff suggestions). A CSR is an office record only —
 * never offered for a job anywhere.
 */
export const NON_SHEET_ROLES = new Set(['csr', 'driver', 'technical', 'ducting'])

export const isSheetCleaner = (e: Pick<Employee, 'role'>) => !NON_SHEET_ROLES.has(String(e.role || 'cleaner'))
export const isJobStaff = (e: Pick<Employee, 'role'>) => String(e.role) !== 'csr'
/** R-EMP-12: can be given a job or booking — not Inactive and not a CSR */
export const isAssignable = (e: Partial<Pick<Employee, 'role' | 'status'>>) => e.status !== 'inactive' && String(e.role) !== 'csr'

/**
 * R-EMP-16: an employee works for the company only between the start and the end of the contract.
 *   start = Joined Date (Contract Start), or the Training Start when it is earlier (an under-trainee starts there)
 *   end   = Contract End Date (empty = open-ended)
 * Outside it the employee is not offered on the Excel Job Sheet (no empty block, no suggestion, not in the
 * attendance popup or Add Job). A missing date means no limit on that side.
 */
export function employmentStart(e: Partial<Pick<Employee, 'joined_date' | 'training_start_date'>>): string {
  const joined = String(e.joined_date || '').slice(0, 10)
  const training = String(e.training_start_date || '').slice(0, 10)
  if (training && (!joined || training < joined)) return training
  return joined
}
export function isEmployedOn(e: Partial<Pick<Employee, 'joined_date' | 'training_start_date' | 'end_date'>>, date: string): boolean {
  if (!date) return true
  const start = employmentStart(e)
  const end = String(e.end_date || '').slice(0, 10)
  return (!start || date >= start) && (!end || date <= end)
}

/**
 * R-SHEET-02: the Staff column shows each cleaner's Short Name (Full Name when none is set).
 * Display only — the job keeps the full name (R-SYNC-02).
 */
export function shortStaffLabel(staffName: string | undefined, employees: Pick<Employee, 'full_name' | 'short_name'>[]): string {
  if (!staffName) return ''
  const byName = new Map(employees.map(e => [(e.full_name || '').trim().toLowerCase(), (e.short_name || '').trim()]))
  return staffName
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => byName.get(n.toLowerCase()) || n)
    .join(', ')
}
