// UX-125: the "Busy" tag next to a cleaner in staff pickers is live — a job whose time is over no longer counts,
// and when the form already has a time, only a job that overlaps that time counts.
// UX-131: the tag says until when ("Busy till 9:00 PM") and drops as soon as the job is completed
// (job / booking status, or the cleaner pressed End in My Duties). Pickers re-check every minute.
import { useEffect, useState } from 'react'
import type { DailyJob } from '@/types'
import { parseTimeToMinutes } from '@/components/common/Time12hPicker'
import { todayDubai } from '@/lib/dubaiTime'

/** Minutes since midnight in Dubai */
export function dubaiMinutesNow(now = new Date()): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(p.find(x => x.type === 'hour')?.value) % 24
  const m = Number(p.find(x => x.type === 'minute')?.value)
  return h * 60 + m
}

/** Dubai minute of the day, refreshed every 30 s — a component using it re-renders when a job's time runs out */
export function useDubaiMinute(): number {
  const [now, setNow] = useState(() => dubaiMinutesNow())
  useEffect(() => {
    const t = setInterval(() => setNow(dubaiMinutesNow()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

const span = (start?: string, end?: string): [number, number] | null => {
  const a = parseTimeToMinutes(start || ''); const b = parseTimeToMinutes(end || '')
  if (a === null || b === null) return null
  return [a, b <= a ? b + 24 * 60 : b] // ends after midnight
}

/** "9:00 PM" from minutes since midnight (past midnight wraps) */
const clock = (min: number) => {
  const h24 = Math.floor(min / 60) % 24
  const m = String(min % 60).padStart(2, '0')
  return `${h24 % 12 || 12}:${m} ${h24 >= 12 ? 'PM' : 'AM'}`
}

const DONE = new Set(['completed', 'cancelled', 'done'])

export interface BusyInfo {
  shiftCount: number
  info: string
  /** Latest end time of the cleaner's open jobs, e.g. "9:00 PM" ('' = not known) */
  until: string
  /** internal: that end time in minutes, to keep the latest one */
  untilMin?: number
}

/** Tag text: "Busy till 9:00 PM" (or just "Busy" when no end time is known) */
export const busyLabel = (b?: { until?: string } | null) => (b?.until ? `Busy till ${b.until}` : 'Busy')

/**
 * Cleaners busy on `date`:
 *  - a past date: nobody (every job is over);
 *  - today: only jobs not finished yet (end time later than now, Dubai);
 *  - a future date: every job that day;
 *  - with the form's own time (`window`): only jobs overlapping it;
 *  - never a job that is completed / cancelled, or that this cleaner has ended (`isDone`).
 * `ignoreIds`: the job being edited.
 */
export function busyCleaners(jobs: Pick<DailyJob, 'id' | 'date' | 'staff_name' | 'start_time' | 'end_time' | 'address'>[], date: string,
  opts: { window?: { start?: string; end?: string }; ignoreIds?: string[]; today?: string; nowMin?: number
    /** true when this cleaner has finished this job (My Duties → End, or the booking is completed) */
    isDone?: (jobId: string, cleanerLower: string, job: Pick<DailyJob, 'id'> & { booking_id?: string }) => boolean } = {}): Map<string, BusyInfo> {
  const map = new Map<string, BusyInfo>()
  const today = opts.today || todayDubai()
  if (!date || date < today) return map
  const now = opts.nowMin ?? dubaiMinutesNow()
  const win = opts.window ? span(opts.window.start, opts.window.end) : null
  for (const j of jobs) {
    if (j.date !== date || !j.staff_name || (opts.ignoreIds || []).includes(String(j.id))) continue
    const status = String((j as { status?: string }).status || '').toLowerCase()
    if (DONE.has(status)) continue
    // no end time saved → start + duty hours
    let endMin: number | null = null
    let s = span(j.start_time, j.end_time)
    if (s) endMin = s[1]
    else {
      const a = parseTimeToMinutes(j.start_time || '')
      const hours = Number((j as { duty_hours?: number }).duty_hours) || 0
      if (a !== null && hours > 0) { endMin = a + Math.round(hours * 60); s = [a, endMin] }
    }
    if (date === today && s && s[1] <= now) continue // finished already — duty hours over
    if (win && s && !(s[0] < win[1] && win[0] < s[1])) continue // does not touch the chosen time
    const until = endMin !== null ? clock(endMin) : ''
    const names = j.staff_name.split(/[,+/&]|\band\b/i).map(n => n.trim().toLowerCase()).filter(Boolean)
    const time = j.start_time && until ? `${j.start_time} – ${until}` : (j.start_time || 'time not set')
    for (const n of names) {
      if (opts.isDone?.(String(j.id), n, j as Pick<DailyJob, 'id'> & { booking_id?: string })) continue
      const prev = map.get(n)
      if (prev) {
        prev.shiftCount += 1; prev.info += `, ${time}`
        if (endMin !== null && (prev.untilMin === undefined || endMin > prev.untilMin)) { prev.untilMin = endMin; prev.until = until }
      } else map.set(n, { shiftCount: 1, info: `${time}${j.address ? ` (${j.address})` : ''}`, until, untilMin: endMin ?? undefined })
    }
  }
  return map
}
