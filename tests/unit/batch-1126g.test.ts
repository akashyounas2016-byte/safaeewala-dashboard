// 2026-11-26 (g): leave from the app — full, half day, short leave, balance, office alert (R-ATT-12)
import { readFileSync } from 'node:fs'
import { leaveDates, leaveReason, leaveMarks } from '@/lib/leaveRequests'
import { leaveBalance, isAwayMark, ANNUAL_LEAVE_DAYS } from '@/lib/attendance'
import { leaveRequestAlerts } from '@/lib/alerts'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

eq(leaveDates({ kind: 'Annual Leave', from: '2026-12-01', to: '2026-12-03', reason: '' }), ['2026-12-01', '2026-12-02', '2026-12-03'], 'annual leave: one row per day')
eq(leaveDates({ kind: 'Half Day', from: '2026-12-01', to: '2026-12-05', reason: '' }), ['2026-12-01'], 'half day is one day')
eq([leaveReason({ kind: 'Half Day', from: 'x', part: 'Afternoon', reason: 'doctor' }), leaveReason({ kind: 'Short Leave', from: 'x', startTime: '14:00', endTime: '16:00', reason: 'bank' })],
  ['Afternoon off · doctor', '14:00–16:00 · bank'], 'the part of the day / the hours go into the reason')
const m = leaveMarks({ kind: 'Sick Leave', from: '2026-12-01', reason: 'fever' }, 'e1', 'Ambika', 'T')[0]
eq([m.key, m.mark.status, m.mark.approval, m.mark.category], ['2026-12-01_id:e1', 'on_leave', 'pending', 'Sick Leave'], 'a request is a pending leave mark for that person and date')

const marks = {
  '2026-02-01_id:e1': { status: 'on_leave', category: 'Annual Leave', approval: 'approved' },
  '2026-02-02_id:e1': { status: 'on_leave', category: 'Annual Leave', approval: 'approved' },
  '2026-03-01_id:e1': { status: 'on_leave', category: 'Half Day', approval: 'approved' },
  '2026-04-01_id:e1': { status: 'on_leave', category: 'Sick Leave', approval: 'approved' },
  '2026-05-01_id:e1': { status: 'on_leave', category: 'Short Leave', approval: 'approved' },
  '2026-06-01_id:e1': { status: 'on_leave', category: 'Annual Leave', approval: 'rejected' },
  '2026-12-01_id:e1': { status: 'on_leave', category: 'Annual Leave', approval: 'pending' },
  '2025-12-01_id:e1': { status: 'on_leave', category: 'Annual Leave', approval: 'approved' },
  '2026-02-01_id:e2': { status: 'on_leave', category: 'Annual Leave', approval: 'approved' },
} as never
eq(leaveBalance(marks, 'e1', '2026'), { annualUsed: 2.5, annualLeft: ANNUAL_LEAVE_DAYS - 2.5, sick: 1, emergency: 0, halfDays: 1, shortLeaves: 1, pending: 1 }, 'balance: approved only, half day = 0.5 annual, this year, this person')
eq([isAwayMark({ status: 'on_leave', category: 'Half Day' } as never), isAwayMark({ status: 'on_leave', category: 'Short Leave' } as never), isAwayMark({ status: 'on_leave', category: 'Annual Leave' } as never)],
  [false, false, true], 'half day / short leave: still on the job sheet for the other part of the day')

const al = leaveRequestAlerts({ '2026-12-01_id:e1': { status: 'on_leave', approval: 'pending', category: 'Annual Leave' }, '2026-12-02_id:e1': { status: 'on_leave', approval: 'pending', category: 'Annual Leave' }, '2026-11-01_id:e1': { status: 'on_leave', approval: 'pending' } },
  [{ id: 'e1', full_name: 'Ambika' }] as never[], '2026-11-26')
eq(al.map(a => [a.title, /2 days/.test(a.message)]), [['Leave request · Ambika', true]], 'office alert: one per person, upcoming days only')

const sql = readFileSync('supabase/migrations/2026-11-26_field_leave_requests.sql', 'utf8')
eq(/cleaner_key = 'id:' \|\| public\.my_employee_id\(\)\s+and status = 'on_leave' and approval = 'pending'/.test(sql) && /attendance_marks_field_cancel[\s\S]*approval = 'pending'/.test(sql), true, 'a field login may only add / cancel its own pending leave')
eq(/<MyLeave employeeId=\{person\.id\}/.test(readFileSync('src/pages/MyDuties.tsx', 'utf8')), true, 'My leave on My Duties')
