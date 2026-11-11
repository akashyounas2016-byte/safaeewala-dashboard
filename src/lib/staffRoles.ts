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
