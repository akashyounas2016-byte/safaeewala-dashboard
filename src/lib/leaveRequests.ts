import { supabase } from '@/lib/supabase'
import { addDays } from '@/lib/dubaiTime'
import { markToRow, HALF_DAY, SHORT_LEAVE, type AttendanceOverride } from '@/lib/attendance'

/**
 * R-ATT-12: a cleaner / driver asks for leave from the app (My Duties). Each day is one pending mark in
 * attendance_marks ("<date>_id:<employee id>"), the same rows the office approves on Attendance (R-ATT-05).
 * Needs the SQL 2026-11-26_field_leave_requests.sql (A47): a field login may add, change or cancel only its own
 * pending requests.
 */
export type LeaveKind = 'Annual Leave' | 'Sick Leave' | 'Emergency Leave' | typeof HALF_DAY | typeof SHORT_LEAVE
export const LEAVE_KINDS: { kind: LeaveKind; label: string; note: string }[] = [
  { kind: 'Annual Leave', label: 'Annual leave', note: 'Full days off (holiday, travel)' },
  { kind: 'Sick Leave', label: 'Sick leave', note: 'Ill — add the reason' },
  { kind: 'Emergency Leave', label: 'Emergency', note: 'Family or urgent matter' },
  { kind: HALF_DAY, label: 'Half day', note: 'Morning or afternoon off' },
  { kind: SHORT_LEAVE, label: 'Short leave', note: 'A few hours (from – to)' },
]
export const MAX_LEAVE_DAYS = 30

export interface LeaveForm {
  kind: LeaveKind
  from: string
  to?: string
  part?: 'Morning' | 'Afternoon'
  startTime?: string
  endTime?: string
  reason: string
}

/** The dates of a request (one for half day / short leave) */
export function leaveDates(f: LeaveForm): string[] {
  if (f.kind === HALF_DAY || f.kind === SHORT_LEAVE || !f.to || f.to <= f.from) return [f.from]
  const out: string[] = []
  for (let d = f.from; d <= f.to && out.length < MAX_LEAVE_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

/** What is written in the reason: the part of the day or the hours, then the person's words */
export function leaveReason(f: LeaveForm): string {
  const when = f.kind === HALF_DAY ? `${f.part || 'Morning'} off` : f.kind === SHORT_LEAVE ? `${f.startTime || '?'}–${f.endTime || '?'}` : ''
  return [when, f.reason.trim()].filter(Boolean).join(' · ')
}

export function leaveMarks(f: LeaveForm, employeeId: string, by: string, now = new Date().toISOString()): { key: string; mark: AttendanceOverride }[] {
  return leaveDates(f).map(date => ({
    key: `${date}_id:${employeeId}`,
    mark: { status: 'on_leave', category: f.kind, reason: leaveReason(f), updatedAt: now, requestedBy: by, approval: 'pending' },
  }))
}

const friendly = (msg: string) => /row-level security|permission|policy/i.test(msg)
  ? 'The office has not switched on leave requests from the app yet (A47). Please call the office.'
  : msg

export async function submitLeave(f: LeaveForm, employeeId: string, name: string): Promise<string | null> {
  const rows = leaveMarks(f, employeeId, name).map(({ key, mark }) => markToRow(key, mark, name))
  const { error } = await supabase.from('attendance_marks').upsert(rows)
  return error ? friendly(error.message) : null
}

export async function cancelLeave(key: string): Promise<string | null> {
  const { error } = await supabase.from('attendance_marks').delete().eq('id', key).eq('approval', 'pending')
  return error ? friendly(error.message) : null
}
