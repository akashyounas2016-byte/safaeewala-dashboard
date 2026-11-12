import type { DailyJob, Employee } from '@/types'
import { daysUntil } from '@/lib/utils'
import { addDays, todayDubai } from '@/lib/dubaiTime'
import type { AttendanceOverride } from '@/lib/attendance'

export interface HealthComponent {
  label: string
  score: number   // points earned (a deduction is negative, with max 0)
  max: number     // points possible
  detail: string
}

/** R-EMP-13: a complaint about the cleaner (from Complaints) — its priority is the severity */
export interface CleanerComplaint { priority: 'low' | 'medium' | 'high'; status: string; job_date?: string | null; created_at: string }
/** Points taken off the Health Score per complaint in the last 90 days, by severity; at most 40 in all */
export const COMPLAINT_PENALTY = { high: 15, medium: 8, low: 3 } as const
export const COMPLAINT_PENALTY_CAP = 40
const complaintDate = (c: CleanerComplaint) => (c.job_date || c.created_at || '').slice(0, 10)

export interface EmployeeHealth {
  score: number   // 0–100
  grade: 'Excellent' | 'Good' | 'Needs Attention' | 'At Risk'
  components: HealthComponent[]
  absences: { date: string; reason: string }[]
  /** R-EMP-13: complaints of the last 90 days that lowered the score */
  complaints: { count: number; deduction: number; open: number }
}

const WINDOW_DAYS = 90          // attendance look-back
const ACTIVITY_DAYS = 30        // recent activity look-back
const EXPECTED_WORK_DAYS = 22   // working days expected in ACTIVITY_DAYS

// Dubai calendar dates (owner decision: Asia/Dubai). toISOString() was UTC, so from midnight to 04:00
// Dubai "today" was still yesterday and today's absences were left out of the score (R-EMP-03).
const isoDaysAgo = (n: number) => addDays(todayDubai(), -n)

const isWorkedShift = (j: DailyJob) => (Number(j.duty_hours) || 0) > 0 || (Number(j.charges) || 0) > 0

/**
 * Performance Health Score (0–100) built from data the dashboard already has:
 *  - Attendance (50): worked days vs. specifically-marked absences in the last 90 days.
 *    Follows the attendance rule — only explicit absences count; blank days are "available",
 *    and approved leave / weekly off are not penalised.
 *  - Activity (30): distinct days worked in the last 30 days vs. 22 expected working days.
 *  - Compliance (20): Visa, Passport, Work Permit and Emirates ID not expired.
 */
export function calcEmployeeHealth(emp: Employee, empJobs: DailyJob[], overrides: Record<string, AttendanceOverride> = {}, complaints: CleanerComplaint[] = []): EmployeeHealth {
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

  // Manual marks from the Attendance screen override the job sheet for that date (R-ATT-03).
  // A pending leave is not an absence; a rejected leave is saved as absent (R-ATT-05).
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

  // R-EMP-13: complaints about this cleaner (last 90 days) lower the score by their severity — resolved
  // ones count too (the complaint happened); the cleaner's record shows each one with its status
  const recentComplaints = complaints.filter(c => { const d = complaintDate(c); return d >= windowStart && d <= today })
  const deduction = Math.min(COMPLAINT_PENALTY_CAP, recentComplaints.reduce((s, c) => s + (COMPLAINT_PENALTY[c.priority] ?? COMPLAINT_PENALTY.medium), 0))
  const openComplaints = recentComplaints.filter(c => c.status === 'open' || c.status === 'in_progress').length
  const by = (p: CleanerComplaint['priority']) => recentComplaints.filter(c => c.priority === p).length
  const complaintPart: HealthComponent = {
    label: 'Complaints',
    max: 0,
    score: -deduction,
    detail: recentComplaints.length
      ? `${recentComplaints.length} in 90 days (${[by('high') && `${by('high')} high`, by('medium') && `${by('medium')} medium`, by('low') && `${by('low')} low`].filter(Boolean).join(', ')})${openComplaints ? ` · ${openComplaints} still open` : ''}`
      : 'No complaints in the last 90 days',
  }

  const components = [attendance, activity, compliance, complaintPart]
  const score = Math.max(0, components.reduce((s, c) => s + c.score, 0))
  const grade: EmployeeHealth['grade'] =
    score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs Attention' : 'At Risk'

  return { score, grade, components, absences, complaints: { count: recentComplaints.length, deduction, open: openComplaints } }
}
