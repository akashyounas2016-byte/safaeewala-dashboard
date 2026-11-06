import type { DailyJob, Employee } from '@/types'
import { splitStaffNames, isBogusJob } from '@/lib/clientDataSync'
import { findAllClashes } from '@/lib/shiftClash'
import { buildRouteSites, minutesOf } from '@/lib/driverRoutes'
import type { DayPlan } from '@/lib/driverPlans'
import { checkinId, CHECKIN_LABEL, type JobCheckin } from '@/lib/jobCheckins'

/**
 * UX-94: the crew timeline on the Daily Job Sheet (V1 design) — one lane per cleaner over the day,
 * jobs as blocks, clashes and jobs without a cleaner listed above it. Attendance follows R-ATT-01:
 * a cleaner without jobs is Available, only an explicit mark makes them Absent / On leave.
 */
export type LaneState = 'working' | 'available' | 'absent' | 'leave' | 'open'

export interface TimelineBlock {
  job: DailyJob
  address: string
  start: string
  end: string
  startMin: number
  endMin: number
  monthly: boolean
  clash: boolean
  open: boolean
}

export interface CrewLane {
  name: string
  state: LaneState
  hours: number
  blocks: TimelineBlock[]
}

export interface TimelineIssue {
  kind: 'clash' | 'open'
  staff: string
  text: string
  job: DailyJob
}

export interface CrewTimeline {
  lanes: CrewLane[]
  startMin: number
  endMin: number
  issues: TimelineIssue[]
}

/** 8 PM: every minute after it is overtime (R-OT-01 scenario 1) */
export const OT_FROM_MIN = 20 * 60

// UX-103: the axis runs 09:00–23:00 (a job outside it still widens the axis so it is never cut off)
const DAY_START = 9 * 60
const DAY_END = 23 * 60
const lower = (s: string) => s.trim().toLowerCase()
const addressOf = (j: DailyJob) => (j.address || '').trim() || 'No address'
const span = (j: DailyJob): [number, number] | null => {
  const s = minutesOf(String(j.start_time || ''))
  let e = minutesOf(String(j.end_time || ''))
  if (s === null || e === null) return null
  if (e <= s) e += 24 * 60 // ends after midnight
  return [s, Math.min(e, 24 * 60)]
}
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/**
 * @param jobs   the day's jobs (one row per job, cleaners comma-separated)
 * @param roster every cleaner of the day (buildCleanerRoster)
 * @param markOf 'absent' / 'leave' for a cleaner marked in Attendance, else undefined
 */
export function buildCrewTimeline(jobs: DailyJob[], roster: string[], markOf: (name: string) => 'absent' | 'leave' | undefined): CrewTimeline {
  const day = jobs.filter(j => !isBogusJob(j))
  const clashKeys = new Set<string>()
  const issues: TimelineIssue[] = []
  findAllClashes(day).forEach(({ staff, a, b }) => {
    const ja = a as DailyJob, jb = b as DailyJob
    clashKeys.add(`${lower(staff)}|${ja.id}`)
    clashKeys.add(`${lower(staff)}|${jb.id}`)
    issues.push({
      kind: 'clash', staff, job: jb,
      text: `${staff} is booked ${ja.start_time}–${ja.end_time} at ${addressOf(ja)} and ${jb.start_time}–${jb.end_time} at ${addressOf(jb)}.`,
    })
  })

  const lanes = new Map<string, CrewLane>()
  const laneFor = (name: string, state: LaneState) => {
    const key = lower(name)
    if (!lanes.has(key)) lanes.set(key, { name, state, hours: 0, blocks: [] })
    return lanes.get(key)!
  }
  let startMin = DAY_START, endMin = DAY_END

  day.forEach(j => {
    const sp = span(j)
    if (!sp) return
    startMin = Math.min(startMin, Math.floor(sp[0] / 60) * 60)
    endMin = Math.max(endMin, Math.ceil(sp[1] / 60) * 60)
    const names = splitStaffNames(j.staff_name || '')
    const base = { job: j, address: addressOf(j), start: hhmm(sp[0]), end: hhmm(sp[1] % (24 * 60)), startMin: sp[0], endMin: sp[1], monthly: j.payment_mode === 'Monthly' }
    if (names.length === 0) {
      laneFor('No cleaner', 'open').blocks.push({ ...base, clash: false, open: true })
      issues.push({ kind: 'open', staff: '', job: j, text: `${addressOf(j)} ${base.start}–${base.end} has no cleaner.` })
      return
    }
    names.forEach(n => {
      const lane = laneFor(n, 'working')
      lane.state = 'working'
      lane.hours += (sp[1] - sp[0]) / 60
      lane.blocks.push({ ...base, clash: clashKeys.has(`${lower(n)}|${j.id}`), open: false })
    })
  })

  roster.forEach(n => {
    if (lanes.has(lower(n))) return
    const mark = markOf(n)
    laneFor(n, mark === 'absent' ? 'absent' : mark === 'leave' ? 'leave' : 'available')
  })

  const rank: Record<LaneState, number> = { open: 0, working: 1, available: 2, leave: 3, absent: 4 }
  const sorted = Array.from(lanes.values())
    .map(l => ({ ...l, hours: Math.round(l.hours * 100) / 100, blocks: l.blocks.sort((a, b) => a.startMin - b.startMin) }))
    .sort((a, b) => rank[a.state] - rank[b.state] || (a.blocks[0]?.startMin ?? 0) - (b.blocks[0]?.startMin ?? 0) || a.name.localeCompare(b.name))
  return { lanes: sorted, startMin, endMin, issues }
}

/** Left / width of a block on the axis, in percent */
export function blockPosition(startMin: number, endMin: number, axisStart: number, axisEnd: number): { left: number; width: number } {
  const total = Math.max(60, axisEnd - axisStart)
  const left = Math.max(0, (startMin - axisStart) / total * 100)
  const width = Math.max(0.5, (Math.min(endMin, axisEnd) - Math.max(startMin, axisStart)) / total * 100)
  return { left, width }
}

/** R-DRV-01: name of the driver who serves this job's site, from the Drivers day plan */
export function driverNameForJob(jobId: string, sites: ReturnType<typeof buildRouteSites>, plan: DayPlan, employees: Pick<Employee, 'id' | 'full_name'>[]): string {
  const site = sites.find(s => s.jobIds.includes(jobId))
  const driverId = site ? plan.assignments[site.key] : undefined
  return driverId ? employees.find(e => e.id === driverId)?.full_name || '' : ''
}

/** R-DUTY-01: the job's progress from My Duties for one cleaner (or the furthest step of any cleaner) */
export function jobStatusLabel(jobId: string, cleaners: string[], checkins: Record<string, JobCheckin>): { label: string; tone: 'done' | 'active' | 'issue' | 'idle' } {
  const rows = cleaners.map(c => checkins[checkinId(jobId, c)]).filter(Boolean)
  if (rows.some(r => r.status === 'issue')) return { label: CHECKIN_LABEL.issue, tone: 'issue' }
  if (rows.length && rows.every(r => r.status === 'done')) return { label: CHECKIN_LABEL.done, tone: 'done' }
  if (rows.some(r => r.status === 'started')) return { label: CHECKIN_LABEL.started, tone: 'active' }
  if (rows.some(r => r.status === 'on_way')) return { label: CHECKIN_LABEL.on_way, tone: 'active' }
  if (rows.some(r => r.status === 'done')) return { label: CHECKIN_LABEL.done, tone: 'done' }
  return { label: 'Scheduled', tone: 'idle' }
}
