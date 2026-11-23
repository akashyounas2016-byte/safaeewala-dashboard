import type { DailyJob, Employee } from '@/types'
import type { DriverLocation } from '@/lib/driverLocation'
import type { JobCheckin } from '@/lib/jobCheckins'
import { CHECKIN_LABEL } from '@/lib/jobCheckins'
import { timeToMinutes } from '@/lib/shiftClash'
import { isBogusJob } from '@/lib/clientDataSync'
import type { DayPlan } from '@/lib/driverPlans'
import type { RouteSite } from '@/lib/driverRoutes'

/**
 * R-OPS-14: Overview live map — who is where, and what they are doing now.
 * Positions come only from what staff share themselves (no tracking without them knowing):
 *  1. "Share my location" on My Duties (cleaners, drivers and CSR; table driver_locations, one row per person);
 *  2. else the place of today's last job step (On the way / Started / Done) on My Duties.
 * Nobody is placed on the map without a real position (R-DATA-03: no made-up pins).
 */
export type LiveRole = 'cleaner' | 'driver' | 'csr'
export type LiveState = 'live' | 'stale' | 'checkin'

export interface LivePerson {
  id: string
  name: string
  role: LiveRole
  roleLabel: string
  lat: number
  lng: number
  state: LiveState
  updatedAt: string
  speed?: number | null
  /** One line: what they are doing now */
  task: string
  /** Second line: time / place / step */
  detail: string
}

export const LIVE_MS = 5 * 60_000
const SAME_DAY_MS = 16 * 3600_000

export function liveRoleOf(e: Pick<Employee, 'role'>): LiveRole {
  return e.role === 'driver' ? 'driver' : e.role === 'csr' ? 'csr' : 'cleaner'
}

const ROLE_LABEL: Record<string, string> = {
  cleaner: 'Cleaner', technical: 'Technician', store_cleaner: 'Store cleaner', supervisor: 'Supervisor', driver: 'Driver', csr: 'CSR',
}

const names = (s?: string) => String(s || '').split(',').map(n => n.trim().toLowerCase()).filter(Boolean)
const isMine = (j: DailyJob, e: Employee) => {
  const list = names(j.staff_name)
  return list.includes(e.full_name.trim().toLowerCase()) || (!!e.short_name && list.includes(e.short_name.trim().toLowerCase()))
}
const site = (j: DailyJob) => (j.address || j.area || 'Job').trim()
const timeOf = (j: DailyJob) => [j.start_time, j.end_time].filter(Boolean).join('–')

/** A cleaner's job now (inside its time), else the next one, else the last one of the day */
export function currentJobOf(e: Employee, jobs: DailyJob[], date: string, nowMin: number): { job: DailyJob; when: 'now' | 'next' | 'last' } | null {
  const mine = jobs.filter(j => j.date === date && !isBogusJob(j) && isMine(j, e))
    .map(j => {
      const s = timeToMinutes(j.start_time), en = timeToMinutes(j.end_time)
      return { j, s: s ?? -1, e: en === null || s === null ? -1 : en > s ? en : en + 1440 }
    })
    .sort((a, b) => a.s - b.s)
  if (!mine.length) return null
  const now = mine.find(x => x.s >= 0 && x.s <= nowMin && nowMin < x.e)
  if (now) return { job: now.j, when: 'now' }
  const next = mine.find(x => x.s > nowMin)
  if (next) return { job: next.j, when: 'next' }
  return { job: mine[mine.length - 1].j, when: 'last' }
}

export function buildLivePeople(input: {
  employees: Employee[]
  locations: DriverLocation[]
  checkins: JobCheckin[]
  dailyJobs: DailyJob[]
  date: string
  nowMs: number
  nowMin: number
  plan?: DayPlan
  sites?: RouteSite[]
}): LivePerson[] {
  const byId = new Map(input.employees.map(e => [e.id, e]))
  const out = new Map<string, LivePerson>()

  const taskOf = (e: Employee): { task: string; detail: string } => {
    const role = liveRoleOf(e)
    if (role === 'driver') {
      const stops = (input.sites || []).filter(s => input.plan?.assignments[s.key] === e.id)
      const vehicle = e.assigned_vehicle ? ` · ${e.assigned_vehicle}` : ''
      if (!stops.length) return { task: 'No stops planned today', detail: `Driver${vehicle}` }
      const upcoming = stops.find(s => (timeToMinutes(s.dropTime) ?? -1) >= input.nowMin) || stops[stops.length - 1]
      return { task: `${stops.length} stop${stops.length === 1 ? '' : 's'} today · next ${upcoming.name}`, detail: `${upcoming.dropTime || ''}${upcoming.area ? ` · ${upcoming.area}` : ''}${vehicle}` }
    }
    if (role === 'csr') return { task: 'CSR on duty', detail: 'Office / customer service' }
    const cur = currentJobOf(e, input.dailyJobs, input.date, input.nowMin)
    if (!cur) return { task: 'No job today', detail: 'Available' }
    const step = input.checkins.find(c => c.job_id === cur.job.id && (c.employee_id === e.id || c.cleaner.trim().toLowerCase() === e.full_name.trim().toLowerCase()))
    const word = cur.when === 'now' ? 'Working at' : cur.when === 'next' ? 'Next job' : 'Last job'
    return { task: `${word}: ${site(cur.job)}`, detail: [timeOf(cur.job), cur.job.area, step ? CHECKIN_LABEL[step.status] : ''].filter(Boolean).join(' · ') }
  }

  // 1. Shared positions (today only)
  input.locations.forEach(l => {
    const e = byId.get(l.employee_id)
    if (!e || e.status === 'inactive' || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return
    const age = input.nowMs - new Date(l.updated_at).getTime()
    if (!(age < SAME_DAY_MS)) return
    const role = liveRoleOf(e)
    out.set(e.id, {
      id: e.id, name: e.full_name, role, roleLabel: ROLE_LABEL[e.role] || 'Staff',
      lat: l.lat, lng: l.lng, state: l.sharing && age < LIVE_MS ? 'live' : 'stale', updatedAt: l.updated_at, speed: l.speed,
      ...taskOf(e),
    })
  })

  // 2. Today's last job step with a position, for cleaners not sharing
  const lastStep = new Map<string, JobCheckin>()
  input.checkins.forEach(c => {
    if (c.date !== input.date || c.lat == null || c.lng == null) return
    const e = (c.employee_id && byId.get(c.employee_id)) || input.employees.find(x => x.full_name.trim().toLowerCase() === c.cleaner.trim().toLowerCase())
    if (!e || out.has(e.id)) return
    const prev = lastStep.get(e.id)
    if (!prev || prev.updated_at < c.updated_at) lastStep.set(e.id, c)
  })
  lastStep.forEach((c, id) => {
    const e = byId.get(id)!
    out.set(id, {
      id, name: e.full_name, role: liveRoleOf(e), roleLabel: ROLE_LABEL[e.role] || 'Staff',
      lat: Number(c.lat), lng: Number(c.lng), state: 'checkin', updatedAt: c.updated_at,
      ...taskOf(e),
    })
  })

  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name))
}
