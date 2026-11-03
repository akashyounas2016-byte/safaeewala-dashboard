import type { DailyJob } from '@/types'
import { splitStaffNames } from '@/lib/clientDataSync'
import { formatTime12h } from '@/lib/utils'

/**
 * R-JOB-01 — a cleaner cannot be booked twice at the same time.
 * One check for every place a job is added or edited (Add Job, Edit Job, Daily Job Sheet, Excel Job Sheet).
 */

/** Minutes since midnight from "09:00 AM", "9:00 pm", "21:30" or "21:30:00"; null when it is not a time */
export function timeToMinutes(t: unknown): number | null {
  const s = formatTime12h(t)
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(s)
  if (!m) return null
  const h = (parseInt(m[1], 10) % 12) + (m[3] === 'PM' ? 12 : 0)
  return h * 60 + parseInt(m[2], 10)
}

/** [start, end) in minutes; a shift that ends after midnight runs into the next day */
function span(start: unknown, end: unknown): [number, number] | null {
  const s = timeToMinutes(start), e = timeToMinutes(end)
  if (s === null || e === null || s === e) return null
  return [s, e > s ? e : e + 24 * 60]
}

export interface ShiftLike {
  id?: string
  date?: string
  staff_name?: string
  start_time?: string
  end_time?: string
}

export interface StaffClash {
  staff: string
  job: ShiftLike
}

const sameJob = (a: ShiftLike, b: ShiftLike) => {
  const ida = String((a as any)._originalJobId || a.id || '')
  const idb = String((b as any)._originalJobId || b.id || '')
  return !!ida && ida === idb
}

/**
 * The first job in `jobs` that already has one of the shift's cleaners at an overlapping time on the same date.
 * Jobs listed in `ignoreIds` (the job being edited) and the shift itself are skipped. Shifts without both times
 * cannot clash. Touching shifts (one ends 12:00, next starts 12:00) are allowed.
 */
export function findStaffClash(jobs: ShiftLike[], shift: ShiftLike, ignoreIds: string[] = []): StaffClash | null {
  const mine = span(shift.start_time, shift.end_time)
  if (!mine) return null
  const names = splitStaffNames(shift.staff_name || '').map(n => n.toLowerCase())
  if (names.length === 0) return null
  const ignore = new Set(ignoreIds.filter(Boolean))
  for (const job of jobs) {
    if (job === shift || sameJob(job, shift)) continue
    if (ignore.has(String(job.id)) || ignore.has(String((job as any)._originalJobId || ''))) continue
    if (shift.date && job.date && job.date !== shift.date) continue
    const other = span(job.start_time, job.end_time)
    if (!other || !(mine[0] < other[1] && other[0] < mine[1])) continue
    const theirs = splitStaffNames(job.staff_name || '')
    const hit = theirs.find(n => names.includes(n.toLowerCase()))
    if (hit) return { staff: hit, job }
  }
  return null
}

/** True when the cleaner, times or date differ — only then can an edit create a new clash */
export function timingChanged(before: ShiftLike | undefined, after: ShiftLike): boolean {
  if (!before) return true
  return (['staff_name', 'start_time', 'end_time', 'date'] as const).some(k => String(before[k] ?? '').trim() !== String(after[k] ?? '').trim())
}

/** First clash caused by any of the `changed` rows inside `rows` (Excel grid: edits, paste, fill down) */
export function findClashAmong(rows: ShiftLike[], changed: ShiftLike[]): (StaffClash & { row: ShiftLike }) | null {
  for (const row of changed) {
    const clash = findStaffClash(rows, row)
    if (clash) return { ...clash, row }
  }
  return null
}

export function clashMessage(c: StaffClash): string {
  const where = c.job.staff_name && (c.job as any).address ? ` at ${(c.job as any).address}` : ''
  return `${c.staff} is already busy from ${formatTime12h(c.job.start_time)} to ${formatTime12h(c.job.end_time)}${where}. Choose another time or cleaner.`
}

/**
 * Every place in `rows` where one cleaner is booked twice at the same time (R-JOB-01). Rows of one
 * job (a team split into one row per cleaner) never clash with each other. Each pair is listed once.
 */
export function findAllClashes(rows: ShiftLike[]): { staff: string; a: ShiftLike; b: ShiftLike }[] {
  const out: { staff: string; a: ShiftLike; b: ShiftLike }[] = []
  rows.forEach((row, i) => {
    const later = rows.slice(i + 1)
    let rest = later
    // a row can clash with several later rows — report each
    for (;;) {
      const hit = findStaffClash(rest, row)
      if (!hit) break
      out.push({ staff: hit.staff, a: row, b: hit.job })
      rest = rest.slice(rest.indexOf(hit.job) + 1)
    }
  })
  return out
}
