import type { Client, DailyJob } from '@/types'
import { isMonthlyClient, jobMatchesClient } from '@/lib/clientDataSync'
import { checkTimesOverlap } from '@/components/dailyJobSheet/jobSheetUtils'

/**
 * R-SCHED-09: a monthly client's cleaner is absent / on leave → the office picks a replacement for
 * that day. Only that date's DailyJob rows change (R-SCHED-01) — the client's permanent cleaner stays.
 */

const splitNames = (s?: string) => (s || '').split(',').map(n => n.trim()).filter(Boolean)

export interface CoverNeed {
  cleaner: string
  rows: DailyJob[]
}

/**
 * Monthly-client jobs on `date` whose cleaner (or one of a team) is away that day.
 * UX-141: "monthly" means the job's client has a monthly contract (service days / day schedule / day cleaners /
 * monthly source) — not a row whose Mode was set to "Monthly" or whose remark says monthly.
 */
export function monthlyJobsNeedingCover(rows: DailyJob[], date: string, away: Set<string>, clients: Client[]): CoverNeed[] {
  const byCleaner = new Map<string, CoverNeed>()
  if (!away.size) return []
  const contracts = clients.filter(c => isMonthlyClient(c)) // no jobs passed → the client's own contract only
  if (!contracts.length) return []
  rows.forEach(r => {
    if (r.date !== date || !(r.address || '').trim() || !contracts.some(c => jobMatchesClient(r, c))) return
    splitNames(r.staff_name).forEach(n => {
      if (!away.has(n.toLowerCase())) return
      const k = n.toLowerCase()
      if (!byCleaner.has(k)) byCleaner.set(k, { cleaner: n, rows: [] })
      byCleaner.get(k)!.rows.push(r)
    })
  })
  return Array.from(byCleaner.values())
}

/** The row with `from` swapped for `to` in its staff list (team order kept, no duplicates) */
export function replaceCleanerOnRow(row: DailyJob, from: string, to: string): DailyJob {
  const names = splitNames(row.staff_name)
  const out: string[] = []
  names.forEach(n => {
    const next = n.toLowerCase() === from.toLowerCase() ? to : n
    if (!out.some(o => o.toLowerCase() === next.toLowerCase())) out.push(next)
  })
  return { ...row, staff_name: out.join(', ') }
}

/** Is `cleaner` free for all of `jobs` on that date (no other job overlapping their times)? */
export function isFreeFor(rows: DailyJob[], cleaner: string, jobs: DailyJob[]): boolean {
  const own = new Set(jobs.map(j => j.id))
  const theirs = rows.filter(r => !own.has(r.id) && jobs.some(j => j.date === r.date) && splitNames(r.staff_name).some(n => n.toLowerCase() === cleaner.toLowerCase()))
  return !jobs.some(j => theirs.some(t => t.date === j.date && checkTimesOverlap(j.start_time, j.end_time, t.start_time, t.end_time)))
}

/**
 * UX-137: copy one row's job onto another row (right-click Copy / Paste, or Alt + drag).
 * The target keeps its id, date and cleaner (when it has one); the money received is not copied —
 * it belongs to the visit that was paid. Row colour is not copied either (R-SHEET-01).
 */
export function pasteRowInto(target: DailyJob, source: DailyJob): DailyJob {
  const { id: _id, date: _date, created_at: _c, booking_id: _b, received: _r, charge_split: _s, staff_name, team_name: _t, row_color: _rc, _otByCleaner: _o, ...job } = source as DailyJob & Record<string, unknown>
  return {
    ...target,
    ...job,
    staff_name: (target.staff_name || '').trim() ? target.staff_name : staff_name,
    received: 0,
  } as DailyJob
}
