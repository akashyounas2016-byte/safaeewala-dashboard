import type { DailyJob, Employee } from '@/types'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import { daysUntil } from '@/lib/utils'

/** Same localStorage key the Attendance screen writes its manual marks to */
const ATTENDANCE_OVERRIDES_KEY = 'safaeewala_cleaner_attendance_overrides'

interface AttendanceOverride {
  status: 'present' | 'available' | 'absent' | 'on_leave'
  reason?: string
}

export interface HealthComponent {
  label: string
  score: number   // points earned
  max: number     // points possible
  detail: string
}

export interface EmployeeHealth {
  score: number   // 0–100
  grade: 'Excellent' | 'Good' | 'Needs Attention' | 'At Risk'
  components: HealthComponent[]
  absences: { date: string; reason: string }[]
}

const WINDOW_DAYS = 90          // attendance look-back
const ACTIVITY_DAYS = 30        // recent activity look-back
const EXPECTED_WORK_DAYS = 22   // working days expected in ACTIVITY_DAYS

const isoDaysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

const isWorkedShift = (j: DailyJob) => (Number(j.duty_hours) || 0) > 0 || (Number(j.charges) || 0) > 0

/**
 * Performance Health Score (0–100) built from data the dashboard already has:
 *  - Attendance (50): worked days vs. specifically-marked absences in the last 90 days.
 *    Follows the attendance rule — only explicit absences count; blank days are "available",
 *    and approved leave / weekly off are not penalised.
 *  - Activity (30): distinct days worked in the last 30 days vs. 22 expected working days.
 *  - Compliance (20): Visa, Passport, Work Permit and Emirates ID not expired.
 */
export function calcEmployeeHealth(emp: Employee, empJobs: DailyJob[]): EmployeeHealth {
  const windowStart = isoDaysAgo(WINDOW_DAYS)
  const activityStart = isoDaysAgo(ACTIVITY_DAYS)
  const today = isoDaysAgo(0)

  const workedDays = new Set<string>()
  const recentWorkedDays = new Set<string>()
  const absenceByDate = new Map<string, string>()

  empJobs.forEach(j => {
    if (!j.date || j.date < windowStart || j.date > today) return
    if (isWorkedShift(j)) {
      workedDays.add(j.date)
      if (j.date >= activityStart) recentWorkedDays.add(j.date)
      return
    }
    // Rows without hours/charges that are specifically marked absent (same wording as Attendance)
    const combined = `${j.remarks || ''} ${j.address || ''}`
    if (/\b(absent|not available|medical emergency|uninformed)\b/i.test(combined)) {
      absenceByDate.set(j.date, j.remarks || 'Marked absent in Daily Job Sheet')
    }
  })

  // Manual marks from the Attendance screen override the job sheet for that date
  const overrides = safeLocalStorageGet<Record<string, AttendanceOverride>>(ATTENDANCE_OVERRIDES_KEY, {})
  const nameKey = (emp.full_name || '').trim().toLowerCase()
  Object.entries(overrides).forEach(([key, o]) => {
    const sep = key.indexOf('_')
    const date = key.slice(0, sep)
    const who = key.slice(sep + 1)
    // Keys are "date_id:<employeeId>" (current) or "date_<name>" (older entries) — AUD-38
    if ((who !== `id:${emp.id}` && who !== nameKey) || date < windowStart || date > today) return
    if (o.status === 'absent') {
      absenceByDate.set(date, o.reason || 'Marked absent in Attendance')
      workedDays.delete(date)
      recentWorkedDays.delete(date)
    } else {
      absenceByDate.delete(date)
    }
  })
  absenceByDate.forEach((_, date) => { if (workedDays.has(date)) absenceByDate.delete(date) })

  const absences = Array.from(absenceByDate, ([date, reason]) => ({ date, reason }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Attendance
  const tracked = workedDays.size + absences.length
  const attendanceRate = tracked > 0 ? workedDays.size / tracked : 1
  const attendance: HealthComponent = {
    label: 'Attendance',
    max: 50,
    score: Math.round(attendanceRate * 50),
    detail: tracked > 0
      ? `${absences.length} absence${absences.length === 1 ? '' : 's'} vs ${workedDays.size} worked day${workedDays.size === 1 ? '' : 's'} (90 days)`
      : 'No attendance records in the last 90 days',
  }

  // Activity
  const activityRate = Math.min(1, recentWorkedDays.size / EXPECTED_WORK_DAYS)
  const activity: HealthComponent = {
    label: 'Activity',
    max: 30,
    score: Math.round(activityRate * 30),
    detail: `${recentWorkedDays.size} of ${EXPECTED_WORK_DAYS} expected working days (30 days)`,
  }

  // Compliance
  const docs = [emp.visa_expiry, emp.passport_expiry, emp.work_permit_expiry, emp.eid_end_date]
  const recorded = docs.filter(Boolean) as string[]
  const valid = recorded.filter(d => daysUntil(d) >= 0).length
  const complianceRate = recorded.length > 0 ? valid / recorded.length : 1
  const compliance: HealthComponent = {
    label: 'Compliance',
    max: 20,
    score: Math.round(complianceRate * 20),
    detail: recorded.length > 0
      ? `${valid} of ${recorded.length} documents valid`
      : 'No document expiry dates recorded',
  }

  const components = [attendance, activity, compliance]
  const score = components.reduce((s, c) => s + c.score, 0)
  const grade: EmployeeHealth['grade'] =
    score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs Attention' : 'At Risk'

  return { score, grade, components, absences }
}
