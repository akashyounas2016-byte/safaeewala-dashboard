import type { DailyJob } from '@/types'
import { isBogusJob, splitStaffNames } from '@/lib/clientDataSync'
import { findStaffClash } from '@/lib/shiftClash'

/**
 * R-DRV-04 — dispatch by area. The office (or a driver) picks an area such as "Al Qusais" and sees
 * that day's jobs there, with cleaners who are free at each job's time ranked first.
 */
export const areaKey = (a?: string) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Areas that have jobs on the date, busiest first */
export function areasOnDate(jobs: DailyJob[], date: string): { area: string; jobs: number; open: number }[] {
  const map = new Map<string, { area: string; jobs: number; open: number }>()
  jobs.forEach(j => {
    if (j.date !== date || isBogusJob(j)) return
    const k = areaKey(j.area) || '(no area)'
    const e = map.get(k) || { area: (j.area || '').trim() || '(no area)', jobs: 0, open: 0 }
    e.jobs++
    if (splitStaffNames(j.staff_name || '').length === 0) e.open++
    map.set(k, e)
  })
  return Array.from(map.values()).sort((a, b) => b.open - a.open || b.jobs - a.jobs || a.area.localeCompare(b.area))
}

export interface CleanerSuggestion {
  name: string
  /** Jobs the cleaner already has that day */
  jobsToday: number
  /** Works in the same area that day — short travel */
  sameArea: boolean
  reason: string
}

/**
 * Cleaners who can take `job`: not already on it, not away (Attendance, R-ATT-08) and free at its time
 * (R-JOB-01). Same-area cleaners first, then the least busy.
 */
export function cleanerSuggestions(jobs: DailyJob[], job: DailyJob, roster: string[], away: Set<string>, limit = 5): CleanerSuggestion[] {
  const onJob = new Set(splitStaffNames(job.staff_name || '').map(n => n.toLowerCase()))
  const sameDay = jobs.filter(j => j.date === job.date && j.id !== job.id && !isBogusJob(j))
  const out: CleanerSuggestion[] = []
  roster.forEach(name => {
    const lower = name.toLowerCase()
    if (onJob.has(lower) || away.has(lower)) return
    if (findStaffClash(sameDay, { staff_name: name, date: job.date, start_time: job.start_time, end_time: job.end_time })) return
    const own = sameDay.filter(j => splitStaffNames(j.staff_name || '').some(n => n.toLowerCase() === lower))
    const sameArea = Boolean(areaKey(job.area)) && own.some(j => areaKey(j.area) === areaKey(job.area))
    out.push({
      name,
      jobsToday: own.length,
      sameArea,
      reason: sameArea ? 'Already in this area today' : own.length === 0 ? 'Free all day' : `${own.length} job${own.length === 1 ? '' : 's'} today, free at this time`,
    })
  })
  return out.sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || a.jobsToday - b.jobsToday || a.name.localeCompare(b.name)).slice(0, limit)
}
