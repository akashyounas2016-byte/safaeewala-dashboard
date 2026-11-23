import type { DailyJob, Employee } from '@/types'
import { addDays } from '@/lib/dubaiTime'
import { timeToMinutes } from '@/lib/shiftClash'

/**
 * R-OPS-16: figures of the Overview, checked 2026-11-23.
 *  - Date filter on Dubai dates (it used the UTC date: after 8 PM Dubai "Today" was still yesterday).
 *  - A job's progress from its date and times, not from its payment ("Pending" money made a finished job "pending",
 *    and any row with an end time counted as done — 94 % "completed" at 11 AM).
 *  - Crew counts each cleaner of a team, and only cleaners (drivers / CSR / office are not crew).
 */
export type OverviewPreset = 'today' | 'yesterday' | '7days' | '30days' | '3months' | '6months' | '1year' | 'all' | 'custom'

const monthsBack = (today: string, m: number) => {
  const [y, mo, d] = today.split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1 - m, d))
  return t.toISOString().slice(0, 10)
}

export function overviewRange(preset: OverviewPreset, today: string, custom: { from?: string; to?: string } = {}): { start: string; end: string; label: string } {
  switch (preset) {
    case 'today': return { start: today, end: today, label: 'Today' }
    case 'yesterday': { const y = addDays(today, -1); return { start: y, end: y, label: 'Yesterday' } }
    case '7days': return { start: addDays(today, -6), end: today, label: 'Last 7 Days' }
    case '30days': return { start: addDays(today, -29), end: today, label: 'Last 30 Days' }
    case '3months': return { start: monthsBack(today, 3), end: today, label: 'Last 3 Months' }
    case '6months': return { start: monthsBack(today, 6), end: today, label: 'Last 6 Months' }
    case '1year': return { start: monthsBack(today, 12), end: today, label: 'Last 1 Year' }
    case 'custom': return { start: custom.from || '', end: custom.to || '', label: custom.from && custom.to ? `${custom.from} to ${custom.to}` : 'Custom Range' }
    default: return { start: '', end: '', label: 'All Time' }
  }
}

export type JobProgress = 'completed' | 'in_progress' | 'confirmed'

/** Done (date passed / end time passed), Live (now inside its time), Scheduled (later) — Dubai date and minutes */
export function jobProgressByTime(job: Pick<DailyJob, 'date' | 'start_time' | 'end_time'>, today: string, nowMin: number): JobProgress {
  const d = (job.date || '').slice(0, 10)
  if (d && d < today) return 'completed'
  if (d && d > today) return 'confirmed'
  const s = timeToMinutes(job.start_time), e = timeToMinutes(job.end_time)
  if (s === null) return 'confirmed'
  if (nowMin < s) return 'confirmed'
  const end = e === null ? s + 60 : e > s ? e : e + 1440
  return nowMin < end ? 'in_progress' : 'completed'
}

/** Cleaners who count as crew (not drivers, CSR, supervisors or inactive staff) */
export const crewMembers = (employees: Employee[]) =>
  employees.filter(e => e.role !== 'driver' && e.role !== 'csr' && e.role !== 'supervisor' && e.status !== 'inactive')

/** Lower-case names of every cleaner on the jobs (a team row "A, B" gives A and B) */
export function dispatchedNames(jobs: Pick<DailyJob, 'staff_name'>[]): Set<string> {
  const s = new Set<string>()
  jobs.forEach(j => String(j.staff_name || '').split(',').map(n => n.trim().toLowerCase()).filter(Boolean).forEach(n => s.add(n)))
  return s
}

/** Is this crew member on the list of names (full name or short name)? */
export const onJobs = (e: Pick<Employee, 'full_name' | 'short_name'>, names: Set<string>) =>
  names.has(e.full_name.trim().toLowerCase()) || (!!e.short_name && names.has(e.short_name.trim().toLowerCase()))

/** Share of clients with more than one job (from the job sheet, linked by client_id) */
export function repeatClientRate(jobs: Pick<DailyJob, 'client_id'>[], clientCount: number): number {
  if (!clientCount) return 0
  const per = new Map<string, number>()
  jobs.forEach(j => { if (j.client_id) per.set(j.client_id, (per.get(j.client_id) || 0) + 1) })
  const repeat = Array.from(per.values()).filter(n => n > 1).length
  return Math.round((repeat / clientCount) * 100)
}

/** Minutes since midnight in Dubai */
export function dubaiMinutes(d: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).split(':').map(Number)
  return (h % 24) * 60 + m
}
