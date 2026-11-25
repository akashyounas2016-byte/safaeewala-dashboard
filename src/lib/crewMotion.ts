import type { DailyJob } from '@/types'
import { parseTimeToMinutes } from '@/components/dailyJobSheet/jobSheetUtils'
import { splitStaffNames } from '@/lib/clientDataSync'

/**
 * R-OPS-20: what each cleaner is doing right now, for the Overview's Live Activity — from today's jobs and the
 * job steps the cleaners press on My Duties (a step wins over the clock).
 *  - working  : a job started (step "Started") or its time is now
 *  - on_way   : step "On the way", or the next job starts within 45 minutes
 *  - done     : every job of the day is finished (step "Done" or its end time passed)
 *  - later    : the next job is later today
 */
export type CrewState = 'working' | 'on_way' | 'done' | 'later'
export interface CrewMotion {
  name: string
  state: CrewState
  place: string
  area: string
  start: number | null // minutes
  end: number | null
  /** 0–100 for a job in progress */
  progress: number
  /** from a job step rather than the clock */
  fromStep: boolean
  jobsToday: number
  jobsDone: number
}
export interface CrewCheckinLike { job_id: string; cleaner: string; status: 'on_way' | 'started' | 'done' | 'issue' }

const ORDER: Record<CrewState, number> = { working: 0, on_way: 1, later: 2, done: 3 }
const ON_WAY_WINDOW = 45
const STEP_GRACE = 60

export function crewMotion(jobs: DailyJob[], checkins: CrewCheckinLike[], date: string, nowMin: number): CrewMotion[] {
  const step = new Map(checkins.map(c => [`${c.job_id}|${c.cleaner.trim().toLowerCase()}`, c.status]))
  type Item = { job: DailyJob; s: number | null; e: number | null; st?: string }
  const byName = new Map<string, { name: string; list: Item[] }>()
  for (const j of jobs) {
    if (j.date !== date) continue
    const s = parseTimeToMinutes(j.start_time), e0 = parseTimeToMinutes(j.end_time)
    const e = s !== null && e0 !== null && e0 <= s ? e0 + 1440 : e0
    for (const n of splitStaffNames(j.staff_name || '')) {
      const name = n.trim()
      if (!name) continue
      const entry = byName.get(name.toLowerCase()) || { name, list: [] }
      entry.list.push({ job: j, s, e, st: step.get(`${j.id}|${name.toLowerCase()}`) })
      byName.set(name.toLowerCase(), entry)
    }
  }
  const out: CrewMotion[] = []
  for (const { name, list } of byName.values()) {
    list.sort((a, b) => (a.s ?? 9999) - (b.s ?? 9999))
    // a step forgotten in the morning (On the way / Started, never Done) stops counting an hour after the job's end
    const isDone = (x: Item) => x.st === 'done' || (x.e !== null && (x.st ? x.e + STEP_GRACE <= nowMin : x.e <= nowMin))
    const jobsDone = list.filter(isDone).length
    const pick = (x: Item, state: CrewState, fromStep: boolean): CrewMotion => {
      const progress = state === 'working' && x.s !== null && x.e !== null && x.e > x.s ? Math.max(3, Math.min(99, Math.round(((nowMin - x.s) / (x.e - x.s)) * 100))) : 0
      return { name, state, place: x.job.address || '—', area: x.job.area || '', start: x.s, end: x.e, progress, fromStep, jobsToday: list.length, jobsDone }
    }
    const started = list.find(x => x.st === 'started' && !isDone(x))
    const onWay = list.find(x => x.st === 'on_way' && !isDone(x))
    const nowJob = list.find(x => !isDone(x) && x.s !== null && x.e !== null && x.s <= nowMin && nowMin < x.e)
    const next = list.find(x => !isDone(x) && x.s !== null && x.s > nowMin)
    if (started) out.push(pick(started, 'working', true))
    else if (onWay) out.push(pick(onWay, 'on_way', true))
    else if (nowJob) out.push(pick(nowJob, 'working', false))
    else if (next && next.s! - nowMin <= ON_WAY_WINDOW) out.push(pick(next, 'on_way', false))
    else if (next) out.push(pick(next, 'later', false))
    else out.push(pick(list[list.length - 1], 'done', list.some(x => x.st === 'done')))
  }
  return out.sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.start ?? 9999) - (b.start ?? 9999) || a.name.localeCompare(b.name))
}

export const fmtMin = (m: number | null) => {
  if (m === null) return '—'
  const mm = ((m % 1440) + 1440) % 1440
  const h = Math.floor(mm / 60), min = mm % 60
  return `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
