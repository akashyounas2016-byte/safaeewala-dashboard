import type { Employee } from '@/types'

/**
 * R-EMP-06: every cleaner named on the Daily Job Sheet becomes a real row in the `employees` table.
 * The row keeps the job-sheet id (`emp-dj-<name>`), so bookings, attendance marks and logins that
 * already point at that id stay linked. TEST records (prod.md §5) are never registered.
 */
export const isTestStaffName = (name: string) => /^\s*test\b/i.test(name || '')

/** Job-sheet cleaners that are shown on screen but not yet saved in the employees table */
export function staffToRegister(allEmployees: Employee[], savedEmployees: Employee[]): Employee[] {
  const saved = new Set(savedEmployees.map(e => e.id))
  return allEmployees.filter(e => e.id.startsWith('emp-dj-') && !saved.has(e.id) && !isTestStaffName(e.full_name))
}

/** A cleaner shown from the job sheet only (no saved row yet) */
export const isUnregisteredStaff = (emp: Employee, savedEmployees: Employee[]) =>
  emp.id.startsWith('emp-dj-') && !savedEmployees.some(e => e.id === emp.id)
