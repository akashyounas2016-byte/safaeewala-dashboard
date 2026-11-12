import type { DailyJob, Employee } from '@/types'
import { cleanNum, parseTimeToMinutes } from '@/components/dailyJobSheet/jobSheetUtils'
import { employeeMatchesStaff, splitStaffNames } from '@/lib/clientDataSync'

/**
 * Minutes since midnight, or null for blank / "—" / unreadable times.
 * R-JOB-02: reads AM / PM — "09:00 AM" → 540, "08:00 PM" → 1200. It used to read only the digits, so
 * 9 AM – 8 PM came out as 9:00 – 8:00 and every such row got a false "Ends before it starts" check.
 */
const toMinutes = (t?: string): number | null => parseTimeToMinutes(t)

/**
 * Inline row checks for the Daily Job Sheet (UX-27). Warnings only — nothing is blocked or changed.
 * Returns a map jobId → list of short messages, for the rows that have at least one.
 */
export function buildRowChecks(jobs: DailyJob[], employees: Employee[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (id: string, msg: string) => { const l = out.get(id) || []; l.push(msg); out.set(id, l) }

  const seen = new Map<string, string>()
  jobs.forEach(j => {
    const start = toMinutes(j.start_time)
    const end = toMinutes(j.end_time)
    if (start !== null && end !== null && end <= start) add(j.id, 'Ends before it starts — check the times (overnight shift?)')

    const charges = cleanNum(j.charges)
    const received = cleanNum(j.received)
    if (charges > 0 && received > charges) add(j.id, `Received AED ${received} is more than charges AED ${charges}`)
    if (String(j.payment_mode).toLowerCase() === 'monthly' && received > 0) add(j.id, 'Monthly-contract visit with money received — record it on Monthly Clients instead?')

    const names = splitStaffNames(j.staff_name || '')
    const unknown = names.filter(n => !employees.some(e => employeeMatchesStaff(e, n)))
    if (names.length > 0 && unknown.length > 0) add(j.id, `Not a registered employee: ${unknown.join(', ')}`)

    const key = `${j.date}|${(j.staff_name || '').trim().toLowerCase()}|${(j.address || '').trim().toLowerCase()}|${j.start_time || ''}`
    if ((j.address || '').trim() && seen.has(key)) {
      add(j.id, 'Duplicate of another row (same staff, address, date and start time)')
      add(seen.get(key)!, 'Duplicate of another row (same staff, address, date and start time)')
    } else seen.set(key, j.id)
  })
  return out
}
