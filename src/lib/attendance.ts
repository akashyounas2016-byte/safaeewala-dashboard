import type { DailyJob, Employee } from '@/types'
import { calcCleanerOTHours, employeeMatchesStaff, isBogusJob, isBogusStaffName, splitStaffNames, SYNTHETIC_STAFF_ACTIVE_DAYS } from '@/lib/clientDataSync'
import { addDays } from '@/lib/dubaiTime'

export type AttendanceStatus = 'present' | 'available' | 'absent' | 'on_leave'

export type LeaveApproval = 'pending' | 'approved' | 'rejected'

export interface AttendanceOverride {
  status: AttendanceStatus
  dutyHours?: number
  reason?: string
  updatedAt: string
  /** Absence / leave category chosen on the Attendance screen (Sick Leave, Uninformed Absence …) */
  category?: string
  /** R-ATT-05: leave needs admin / manager approval; a rejected leave is saved as absent */
  approval?: LeaveApproval
  requestedBy?: string
  decidedBy?: string
  decidedAt?: string
  decisionNote?: string
}

/**
 * Absence categories on the Attendance screen (R-ATT-05). A leave category is a request that
 * admin / manager approve (stays leave) or reject (becomes absent); an absence is final at once.
 */
export const LEAVE_CATEGORIES = ['Sick Leave', 'Emergency Leave', 'Annual Leave', 'Weekly Off'] as const
export const ABSENCE_CATEGORIES = ['Uninformed Absence', 'Other'] as const
export type AbsenceCategory = (typeof LEAVE_CATEGORIES)[number] | (typeof ABSENCE_CATEGORIES)[number]
export const isLeaveCategory = (c?: string) => (LEAVE_CATEGORIES as readonly string[]).includes(c || '')

/** Only admin and manager decide leave requests (R-ATT-05) */
export const canApproveLeave = (role?: string | null) => role === 'admin' || role === 'manager'

/** Weekday of a YYYY-MM-DD calendar date (0 = Sunday), independent of the browser's time zone */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()
}
/** R-ATT-06: Monday leave requests get a yellow flag in the approval list */
export const isMondayDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && weekdayOf(date) === 1

/** The mark a user sets: leave from a non-approver waits for approval; an approver's own leave is approved */
export function newAbsenceMark(category: AbsenceCategory, note: string, role: string | null | undefined, by: string, now = new Date().toISOString()): AttendanceOverride {
  const reason = note.trim() ? `${category}: ${note.trim()}` : category
  if (!isLeaveCategory(category)) return { status: 'absent', category, reason, updatedAt: now, requestedBy: by }
  const approver = canApproveLeave(role)
  return {
    status: 'on_leave', category, reason, updatedAt: now, requestedBy: by,
    approval: approver ? 'approved' : 'pending',
    ...(approver ? { decidedBy: by, decidedAt: now } : {}),
  }
}

/** Admin / manager decision on a pending leave: approve keeps it as leave, reject records an absence */
export function decideLeave(mark: AttendanceOverride, approve: boolean, by: string, note = '', now = new Date().toISOString()): AttendanceOverride {
  return {
    ...mark,
    status: approve ? 'on_leave' : 'absent',
    approval: approve ? 'approved' : 'rejected',
    decidedBy: by,
    decidedAt: now,
    decisionNote: note.trim() || undefined,
    updatedAt: now,
  }
}

/** One row of the Supabase table `attendance_marks` (migration 2026-11-03_attendance_marks.sql) */
export interface AttendanceMarkRow {
  id: string            // "<date>_id:<employeeId>" or "<date>_<name lowercase>" — same key as before
  date: string
  cleaner_key: string
  cleaner_name?: string | null
  status: AttendanceStatus
  category?: string | null
  reason?: string | null
  duty_hours?: number | null
  approval?: LeaveApproval | null
  requested_by?: string | null
  decided_by?: string | null
  decided_at?: string | null
  decision_note?: string | null
  updated_at: string
}

/** "2026-11-03_id:abc" → { date, cleanerKey } */
export function splitMarkKey(key: string): { date: string; cleanerKey: string } {
  const i = key.indexOf('_')
  return i < 0 ? { date: key, cleanerKey: '' } : { date: key.slice(0, i), cleanerKey: key.slice(i + 1) }
}

export function markToRow(key: string, m: AttendanceOverride, cleanerName?: string): AttendanceMarkRow {
  const { date, cleanerKey } = splitMarkKey(key)
  return {
    id: key, date, cleaner_key: cleanerKey, cleaner_name: cleanerName ?? null,
    status: m.status, category: m.category ?? null, reason: m.reason ?? null,
    duty_hours: m.dutyHours ?? null, approval: m.approval ?? null,
    requested_by: m.requestedBy ?? null, decided_by: m.decidedBy ?? null,
    decided_at: m.decidedAt ?? null, decision_note: m.decisionNote ?? null,
    updated_at: m.updatedAt,
  }
}

export function rowToMark(r: AttendanceMarkRow): AttendanceOverride {
  const m: AttendanceOverride = { status: r.status, updatedAt: r.updated_at }
  if (r.duty_hours != null) m.dutyHours = Number(r.duty_hours)
  if (r.reason) m.reason = r.reason
  if (r.category) m.category = r.category
  if (r.approval) m.approval = r.approval
  if (r.requested_by) m.requestedBy = r.requested_by
  if (r.decided_by) m.decidedBy = r.decided_by
  if (r.decided_at) m.decidedAt = r.decided_at
  if (r.decision_note) m.decisionNote = r.decision_note
  return m
}

/** The override of one cleaner on one date: by employee id first, then by name (AUD-38) */
export function findMark(marks: Record<string, AttendanceOverride>, date: string, name: string, employeeId?: string): AttendanceOverride | undefined {
  return (employeeId && marks[`${date}_id:${employeeId}`]) || marks[`${date}_${name.trim().toLowerCase()}`] || undefined
}

export interface DayClassification {
  status: AttendanceStatus
  absenceReason?: string
  /** R-ATT-05: a leave request that admin / manager has not decided yet */
  leavePending?: boolean
  dutyHours: number
  otHours: number
  workedJobs: DailyJob[]
  isManualPresent: boolean
}

/**
 * One cleaner's status for one day — the single implementation of R-ATT-01..03, used by the
 * Attendance list and the monthly calendar (UX-20).
 *  - a manual override wins (R-ATT-03)
 *  - any worked row (hours or charges) → present (R-ATT-02)
 *  - only rows specifically marked absent / leave → absent / on leave
 *  - otherwise available — blank days are never absences (R-ATT-01)
 */
export function classifyAttendanceDay(jobs: DailyJob[], override?: AttendanceOverride | null, cleaner?: Employee | string): DayClassification {
  let dutyHours = 0
  let otHours = 0
  const workedJobs: DailyJob[] = []
  let mark: { reason: string; isLeave: boolean } | null = null

  jobs.forEach(j => {
    const rem = (j.remarks || '').trim().toLowerCase()
    const addr = (j.address || '').trim().toLowerCase()
    const combined = `${rem} ${addr}`
    const isWorkedShift = (Number(j.duty_hours) || 0) > 0 || (Number(j.charges) || 0) > 0
    if (!isWorkedShift && /\b(absent|not available|medical emergency|uninformed)\b/i.test(combined)) {
      mark = { reason: j.remarks || j.address || 'Specifically marked absent in Daily Sheet', isLeave: false }
      return
    }
    if (!isWorkedShift && (/\b(on leave|sick leave|annual leave|emergency leave|day off|weekly off)\b/i.test(combined) || rem === 'leave' || addr === 'leave')) {
      mark = { reason: j.remarks || j.address || 'Approved Leave / Day Off', isLeave: true }
      return
    }
    dutyHours += Number(j.duty_hours) || 0
    otHours += calcCleanerOTHours(j, cleaner)
    workedJobs.push(j)
  })

  dutyHours = Math.round(dutyHours * 10) / 10
  otHours = Math.round(otHours * 10) / 10
  workedJobs.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  let status: AttendanceStatus = 'available'
  let absenceReason: string | undefined
  let isManualPresent = false
  let leavePending = false
  const m = mark as { reason: string; isLeave: boolean } | null
  if (override) {
    status = override.status
    absenceReason = override.reason
    if (override.status === 'on_leave' && override.approval === 'pending') leavePending = true
    if (override.status === 'present' && workedJobs.length === 0) {
      isManualPresent = true
      dutyHours = override.dutyHours ?? 8
    }
  } else if (workedJobs.length > 0) {
    status = 'present'
  } else if (m) {
    status = m.isLeave ? 'on_leave' : 'absent'
    absenceReason = m.reason
  }
  return { status, absenceReason, dutyHours, otHours, workedJobs, isManualPresent, leavePending }
}

/**
 * Who appears on the attendance list and the job sheet's "no job" rows (R-ATT-04, AUD-51):
 * registered non-inactive employees, unregistered names seen on the job sheet in the last 60 days,
 * and anyone with a shift on the date. Shared rows ("Sita, Rupa") are split. No hard-coded roster.
 */
export function buildCleanerRoster(employees: Employee[], dailyJobs: DailyJob[], date: string): string[] {
  const map = new Map<string, string>() // lower -> display
  employees.forEach(e => {
    const name = (e.full_name || '').trim()
    if (name && e.status !== 'inactive') map.set(name.toLowerCase(), name)
  })
  // A name that belongs to a registered employee is that employee, not a new cleaner
  const isKnown = (name: string) =>
    map.has(name.toLowerCase()) || employees.some(e => employeeMatchesStaff(e, name))
  const since = addDays(date, -SYNTHETIC_STAFF_ACTIVE_DAYS)
  dailyJobs.forEach(j => {
    if (!j.date || j.date < since || j.date > date || isBogusJob(j)) return
    splitStaffNames(j.staff_name || '').forEach(name => { if (!isKnown(name)) map.set(name.toLowerCase(), name) })
  })
  // Anyone logged on the date (even if inactive) so their shift is visible
  dailyJobs.forEach(j => {
    if ((j.date || '').split('T')[0] !== date) return
    splitStaffNames(j.staff_name || '').forEach(name => {
      if (map.has(name.toLowerCase())) return
      const emp = employees.find(e => employeeMatchesStaff(e, name))
      map.set((emp?.full_name || name).toLowerCase(), emp?.full_name || name)
    })
  })
  const bogusStaff = ['total', 'gross', 'summary', 'net total', 'driver', 'n/a', 'na', '—', '-']
  return Array.from(map.values())
    .filter(name => !bogusStaff.includes(name.trim().toLowerCase()) && !isBogusStaffName(name))
    .sort((a, b) => a.localeCompare(b))
}

/** R-ATT-08: absent, or on leave (pending or approved), on that date — kept off the job sheet and the assign lists */
export const isAwayMark = (m?: AttendanceOverride | null) => m?.status === 'absent' || m?.status === 'on_leave'

/** R-ATT-08: lower-case names of every cleaner away on a date, whether the mark is kept by employee id or by name */
export function awayCleanerNames(marks: Record<string, AttendanceOverride>, employees: Pick<Employee, 'id' | 'full_name'>[], date: string): Set<string> {
  const out = new Set<string>()
  Object.entries(marks).forEach(([key, m]) => {
    if (!key.startsWith(`${date}_`) || !isAwayMark(m)) return
    const { cleanerKey } = splitMarkKey(key)
    if (cleanerKey.startsWith('id:')) {
      const emp = employees.find(e => e.id === cleanerKey.slice(3))
      if (emp?.full_name) out.add(emp.full_name.trim().toLowerCase())
    } else if (cleanerKey) out.add(cleanerKey.trim().toLowerCase())
  })
  return out
}
