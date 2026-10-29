import type { DailyJob, Employee } from '@/types'
import { calcJobOTHours, employeeMatchesStaff, isBogusJob, isBogusStaffName, splitStaffNames, SYNTHETIC_STAFF_ACTIVE_DAYS } from '@/lib/clientDataSync'
import { addDays } from '@/lib/dubaiTime'

export type AttendanceStatus = 'present' | 'available' | 'absent' | 'on_leave'

export interface AttendanceOverride {
  status: AttendanceStatus
  dutyHours?: number
  reason?: string
  updatedAt: string
}

export interface DayClassification {
  status: AttendanceStatus
  absenceReason?: string
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
export function classifyAttendanceDay(jobs: DailyJob[], override?: AttendanceOverride | null): DayClassification {
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
    otHours += calcJobOTHours(j)
    workedJobs.push(j)
  })

  dutyHours = Math.round(dutyHours * 10) / 10
  otHours = Math.round(otHours * 10) / 10
  workedJobs.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  let status: AttendanceStatus = 'available'
  let absenceReason: string | undefined
  let isManualPresent = false
  const m = mark as { reason: string; isLeave: boolean } | null
  if (override) {
    status = override.status
    absenceReason = override.reason
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
  return { status, absenceReason, dutyHours, otHours, workedJobs, isManualPresent }
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
