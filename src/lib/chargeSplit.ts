import type { DailyJob } from '@/types'
import { splitStaffNames, employeeMatchesStaff } from '@/lib/clientDataSync'
import type { Employee } from '@/types'

/**
 * R-PAY-05 — the money of a team job, per cleaner (Add Job → Charges → Split Mode).
 * Lump Sum Mode: no split; the job's charges, advance received and payment mode belong to the lead row.
 * Split Mode: one entry per cleaner with their own charges, received amount and payment mode; the job's
 * charges / received are the totals of the entries.
 */
export interface ChargeSplitEntry {
  cleaner: string
  charges: number
  received: number
  payment_mode: string
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The entry of one cleaner, by name (or by employee, so "Laxmi" matches "Laxmi Rani") */
export function splitEntryOf(job: Pick<DailyJob, 'charge_split'>, cleaner: string | Employee): ChargeSplitEntry | undefined {
  const list = job.charge_split || []
  if (typeof cleaner === 'string') return list.find(e => same(e.cleaner, cleaner))
  return list.find(e => same(e.cleaner, cleaner.full_name) || employeeMatchesStaff(cleaner, e.cleaner))
}

/** A cleaner's part of a job: their split entry, or an equal share of the job when it is not split */
export function cleanerShare(job: Pick<DailyJob, 'charge_split' | 'charges' | 'received' | 'staff_name' | 'payment_mode'>, cleaner: string | Employee): { charges: number; received: number; payment_mode: string } {
  const entry = splitEntryOf(job, cleaner)
  if (entry) return { charges: entry.charges, received: entry.received, payment_mode: entry.payment_mode }
  const n = Math.max(1, splitStaffNames(job.staff_name || '').length)
  return { charges: (Number(job.charges) || 0) / n, received: (Number(job.received) || 0) / n, payment_mode: String(job.payment_mode || '') }
}

/** Totals of a split, and the job's payment mode: the common mode, else the lead's */
export function splitTotals(list: ChargeSplitEntry[]): { charges: number; received: number; payment_mode: string } {
  const charges = list.reduce((s, e) => s + (Number(e.charges) || 0), 0)
  const received = list.reduce((s, e) => s + (Number(e.received) || 0), 0)
  const modes = Array.from(new Set(list.map(e => e.payment_mode).filter(Boolean)))
  return { charges, received, payment_mode: modes.length === 1 ? modes[0] : (list[0]?.payment_mode || '') }
}
