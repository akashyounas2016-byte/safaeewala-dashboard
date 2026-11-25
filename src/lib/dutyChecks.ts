import type { DailyJob } from '@/types'
import { timeToMinutes } from '@/lib/shiftClash'
import { formatTime12h } from '@/components/dailyJobSheet/jobSheetUtils'

/**
 * R-DUTY-04: checks on a cleaner's day (My Duties, Alerts).
 *  - clash: two of their jobs overlap in time (data from the sheet / monthly schedules) — shown on both cards;
 *  - one job at a time: a job cannot be started while another of theirs is started and not ended;
 *  - late: a job's start time passed by LATE_GRACE minutes and it was not started (cleaner + office are told).
 */
export const LATE_GRACE = 15

type JobLike = Pick<DailyJob, 'id' | 'start_time' | 'end_time' | 'address' | 'area'>
const span = (j: JobLike): [number, number] | null => {
  const s = timeToMinutes(j.start_time), e = timeToMinutes(j.end_time)
  if (s === null || e === null || s === e) return null
  return [s, e > s ? e : e + 1440]
}

/** For each job of ONE person's day: the first other job whose time overlaps it */
export function dutyClashes<T extends JobLike>(jobs: T[]): Map<string, T> {
  const out = new Map<string, T>()
  jobs.forEach(a => {
    const sa = span(a)
    if (!sa) return
    const hit = jobs.find(b => b.id !== a.id && (() => { const sb = span(b); return !!sb && sa[0] < sb[1] && sb[0] < sa[1] })())
    if (hit) out.set(a.id, hit)
  })
  return out
}

export const clashText = (other: JobLike) =>
  `Time clash with ${other.address || other.area || 'another job'} (${formatTime12h(other.start_time)}–${formatTime12h(other.end_time)}). Call the office before starting.`

/** The job (other than `jobId`) that is started and not ended — it has to end first */
export function startBlockedBy<T extends { id: string }>(jobs: T[], statusOf: (id: string) => string | undefined, jobId: string): T | null {
  return jobs.find(j => j.id !== jobId && statusOf(j.id) === 'started') || null
}

/** Minutes late (> 0) when the job should have started by now and no Start / End was pressed; else 0 */
export function minutesLate(job: { start_time?: string; end_time?: string; date?: string }, status: string | undefined, today: string, nowMin: number): number {
  if (String(job.date || '').slice(0, 10) !== today) return 0
  if (status === 'started' || status === 'done') return 0
  const s = timeToMinutes(job.start_time)
  if (s === null) return 0
  const late = nowMin - s
  return late >= LATE_GRACE ? late : 0
}

export const lateText = (late: number) => (late >= 60 ? `${Math.floor(late / 60)} h ${late % 60} min` : `${late} min`)
