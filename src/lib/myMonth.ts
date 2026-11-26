import type { DailyJob, Employee } from '@/types'
import { employeeMatchesStaff, isBogusJob, splitStaffNames } from '@/lib/clientDataSync'
import { recalculateAllRowsOT, cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { splitMarkKey, type AttendanceOverride } from '@/lib/attendance'

/**
 * R-ATT-13: "My month" on My Duties — what the job sheet and Attendance say about one person in a month:
 * days worked, jobs, duty hours, overtime (R-OT-01, the same per-cleaner OT as the sheet), leave and absent days,
 * day by day. Facts only — no pay is worked out here (no payslip rules in the CRM yet).
 */
export interface MyDay { date: string; jobs: number; hours: number; ot: number; mark?: AttendanceOverride }
export interface MyMonth { month: string; days: MyDay[]; workDays: number; jobs: number; hours: number; ot: number; leaveDays: number; halfDays: number; shortLeaves: number; absentDays: number }

const r1 = (n: number) => Math.round(n * 10) / 10

export function myMonth(emp: Employee, allJobs: DailyJob[], marks: Record<string, AttendanceOverride>, month: string): MyMonth {
  const monthJobs = allJobs.filter(j => String(j.date || '').startsWith(month) && !isBogusJob(j) && employeeMatchesStaff(emp, j.staff_name || ''))
  // OT exactly as the sheet works it out: per date and per cleaner, against their basic hours
  const withOT = recalculateAllRowsOT(monthJobs) as (DailyJob & { _otByCleaner?: Record<string, number> })[]
  const byDate = new Map<string, MyDay>()
  for (const j of withOT) {
    const date = String(j.date).slice(0, 10)
    const myName = splitStaffNames(j.staff_name || '').find(n => employeeMatchesStaff(emp, n)) || ''
    const ot = j._otByCleaner?.[myName.toLowerCase()] ?? 0
    const d = byDate.get(date) || { date, jobs: 0, hours: 0, ot: 0 }
    d.jobs += 1; d.hours = r1(d.hours + cleanNum(j.duty_hours)); d.ot = r1(d.ot + ot)
    byDate.set(date, d)
  }
  let leaveDays = 0, halfDays = 0, shortLeaves = 0, absentDays = 0
  for (const [key, m] of Object.entries(marks)) {
    const { date, cleanerKey } = splitMarkKey(key)
    if (!date.startsWith(month)) continue
    if (cleanerKey !== `id:${emp.id}` && cleanerKey.toLowerCase() !== emp.full_name.trim().toLowerCase()) continue
    if (m.status === 'on_leave' && m.approval === 'rejected') continue
    const d = byDate.get(date) || { date, jobs: 0, hours: 0, ot: 0 }
    d.mark = m
    byDate.set(date, d)
    if (m.status === 'absent') absentDays++
    else if (m.status === 'on_leave' && m.approval !== 'pending') {
      if (m.category === 'Half Day') halfDays++
      else if (m.category === 'Short Leave') shortLeaves++
      else leaveDays++
    }
  }
  const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
  return {
    month, days,
    workDays: days.filter(d => d.jobs > 0).length,
    jobs: days.reduce((s, d) => s + d.jobs, 0),
    hours: r1(days.reduce((s, d) => s + d.hours, 0)),
    ot: r1(days.reduce((s, d) => s + d.ot, 0)),
    leaveDays, halfDays, shortLeaves, absentDays,
  }
}
