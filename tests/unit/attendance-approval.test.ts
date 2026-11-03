// R-ATT-05 leave approval, R-ATT-06 Monday flag, R-SYNC-10 attendance_marks table
import fs from 'node:fs'
import {
  newAbsenceMark, decideLeave, classifyAttendanceDay, isMondayDate, weekdayOf, canApproveLeave,
  markToRow, rowToMark, findMark, isLeaveCategory, splitMarkKey,
} from '@/lib/attendance'
import { calcEmployeeHealth } from '@/lib/employeeHealth'
import { ALL_MODULE_KEYS } from '@/lib/permissions'
import { todayDubai } from '@/lib/dubaiTime'
import type { Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const now = '2026-11-03T08:00:00.000Z'

// Who decides
eq(canApproveLeave('admin'), true, 'admin approves leave')
eq(canApproveLeave('manager'), true, 'manager approves leave')
eq(canApproveLeave('employee'), false, 'other roles cannot approve')

// Leave from a supervisor waits; leave from admin / manager is approved; absence is final
const req = newAbsenceMark('Sick Leave', 'fever', 'employee', 'Supervisor A', now)
eq([req.status, req.approval, req.reason, req.requestedBy, req.decidedBy], ['on_leave', 'pending', 'Sick Leave: fever', 'Supervisor A', undefined], 'supervisor leave is a pending request')
const own = newAbsenceMark('Annual Leave', '', 'manager', 'Manager B', now)
eq([own.status, own.approval, own.decidedBy], ['on_leave', 'approved', 'Manager B'], 'manager leave is approved at once')
const abs = newAbsenceMark('Uninformed Absence', '', 'employee', 'Supervisor A', now)
eq([abs.status, abs.approval], ['absent', undefined], 'absence needs no approval')
eq(isLeaveCategory('Weekly Off') && !isLeaveCategory('Other'), true, 'leave vs absence categories')

// Decisions
const approved = decideLeave(req, true, 'Admin', '', now)
eq([approved.status, approved.approval, approved.decidedBy], ['on_leave', 'approved', 'Admin'], 'approve keeps leave')
const rejected = decideLeave(req, false, 'Admin', 'no proof', now)
eq([rejected.status, rejected.approval, rejected.decisionNote], ['absent', 'rejected', 'no proof'], 'reject records absent')

// Day status
eq([classifyAttendanceDay([], req).status, classifyAttendanceDay([], req).leavePending], ['on_leave', true], 'pending leave shows as leave, flagged pending')
eq([classifyAttendanceDay([], approved).status, classifyAttendanceDay([], approved).leavePending], ['on_leave', false], 'approved leave is not pending')
eq(classifyAttendanceDay([], rejected).status, 'absent', 'rejected leave is absent')

// Monday flag (calendar date, any browser time zone)
eq([weekdayOf('2026-11-02'), isMondayDate('2026-11-02'), isMondayDate('2026-11-03'), isMondayDate('2026-11-09')], [1, true, false, true], 'Monday detection')
eq(isMondayDate('bad'), false, 'invalid date is not Monday')

// Table row <-> mark
const key = '2026-11-02_id:emp-1'
eq(splitMarkKey(key), { date: '2026-11-02', cleanerKey: 'id:emp-1' }, 'key split')
const row = markToRow(key, req, 'Ambika')
eq([row.id, row.date, row.cleaner_key, row.cleaner_name, row.approval, row.decided_by], [key, '2026-11-02', 'id:emp-1', 'Ambika', 'pending', null], 'mark to row')
const sorted = (o: object) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
eq(sorted(rowToMark(row)), sorted(req), 'row back to the same mark')
eq(findMark({ [key]: req }, '2026-11-02', 'Ambika', 'emp-1')?.approval, 'pending', 'find by employee id')
eq(findMark({ '2026-11-02_sita': abs }, '2026-11-02', 'Sita ')?.status, 'absent', 'find by name (older key)')

// Health score: pending leave is not an absence, rejected leave is (R-ATT-01, R-EMP-03)
const today = todayDubai()
const emp = { id: 'emp-1', full_name: 'Ambika' } as Employee
const h = (m: object) => calcEmployeeHealth(emp, [], m as never).absences.length
eq(h({ [`${today}_id:emp-1`]: req }), 0, 'pending leave not counted absent')
eq(h({ [`${today}_id:emp-1`]: rejected }), 1, 'rejected leave counted absent')

// Migration: guard + policies + copy of old marks, and the screen it checks exists in the app
const sql = fs.readFileSync('supabase/migrations/2026-11-03_attendance_marks.sql', 'utf8')
eq(/create table if not exists public\.attendance_marks/.test(sql), true, 'table created')
eq(/raise exception 'Only admin or manager can approve leave'/.test(sql), true, 'database refuses leave approval by other roles')
eq(/safaeewala_cleaner_attendance_overrides/.test(sql) && /on conflict \(id\) do nothing/.test(sql), true, 'old marks copied once')
eq(/add table public\.attendance_marks/.test(sql), true, 'table is live (realtime)')
eq((ALL_MODULE_KEYS as string[]).includes('Attendance'), true, "role_can(['Attendance']) names a real screen")
