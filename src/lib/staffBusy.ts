// UX-125: the "Busy" tag next to a cleaner in staff pickers is live — a job whose time is over no longer counts,
// and when the form already has a time, only a job that overlaps that time counts.
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

const span = (start?: string, end?: string): [number, number] | null => {
  const a = parseTimeToMinutes(start || ''); const b = parseTimeToMinutes(end || '')
  if (a === null || b === null) return null
  return [a, b <= a ? b + 24 * 60 : b] // ends after midnight
}

export interface BusyInfo { shiftCount: number; info: string; until: string }

/**
 * Cleaners busy on `date`:
 *  - a past date: nobody (every job is over);
 *  - today: only jobs not finished yet (end time later than now, Dubai);
 *  - a future date: every job that day;
 *  - with the form's own time (`window`): only jobs overlapping it.
 * `ignoreIds`: the job being edited.
 */
export function busyCleaners(jobs: Pick<DailyJob, 'id' | 'date' | 'staff_name' | 'start_time' | 'end_time' | 'address'>[], date: string,
  opts: { window?: { start?: string; end?: string }; ignoreIds?: string[]; today?: string; nowMin?: number } = {}): Map<string, BusyInfo> {
  const map = new Map<string, BusyInfo>()
  const today = opts.today || todayDubai()
  if (!date || date < today) return map
  const now = opts.nowMin ?? dubaiMinutesNow()
  const win = opts.window ? span(opts.window.start, opts.window.end) : null
  for (const j of jobs) {
    if (j.date !== date || !j.staff_name || (opts.ignoreIds || []).includes(String(j.id))) continue
    const status = ((j as any).status || '').toLowerCase()
    if (status === 'completed' || status === 'cancelled' || status === 'done') continue
    const effectiveEnd = j.end_time || ((j as any).duty_hours && j.start_time ? (() => {
      const a = parseTimeToMinutes(j.start_time)
      if (a === null) return ''
      const endMins = a + Math.round(Number((j as any).duty_hours) * 60)
      const h24 = Math.floor(endMins / 60) % 24
      const m = String(endMins % 60).padStart(2, '0')
      const mer = h24 >= 12 ? 'PM' : 'AM'
      const h12 = h24 % 12 || 12
      return `${String(h12).padStart(2, '0')}:${m} ${mer}`
    })() : '')
    const s = span(j.start_time, effectiveEnd)
    if (date === today && s && s[1] <= now) continue // finished already — duty hours over
    if (win && s && !(s[0] < win[1] && win[0] < s[1])) continue // does not touch the chosen time
    const names = j.staff_name.split(/[,+/&]|\band\b/i).map(n => n.trim().toLowerCase()).filter(Boolean)
    const time = j.start_time && effectiveEnd ? `${j.start_time} – ${effectiveEnd}` : (j.start_time || 'time not set')
    for (const n of names) {
      const prev = map.get(n)
      if (prev) { prev.shiftCount += 1; prev.info += `, ${time}` }
      else map.set(n, { shiftCount: 1, info: `${time}${j.address ? ` (${j.address})` : ''}`, until: effectiveEnd || '' })
    }
  }
  return map
}
