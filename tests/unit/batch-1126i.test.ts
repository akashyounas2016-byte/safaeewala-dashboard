// 2026-11-26 (i): My month on My Duties — days, jobs, hours, OT, leave, absences (R-ATT-13)
import { readFileSync } from 'node:fs'
import { myMonth } from '@/lib/myMonth'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const emp = { id: 'e1', full_name: 'Nim Kumari Shahu', short_name: 'Nim' } as never
const J = (id: string, date: string, staff: string, s: string, e: string, h: number) => ({ id, date, staff_name: staff, start_time: s, end_time: e, duty_hours: h, address: `A${id}` })
const jobs = [
  J('1', '2026-11-26', 'Nim Kumari Shahu', '10:00', '13:00', 3),
  J('2', '2026-11-26', 'Nim Kumari Shahu', '14:00', '16:00', 2),
  J('3', '2026-11-25', 'Nim Kumari Shahu, Bina', '18:00', '22:00', 4), // 2 h after 8 PM = OT (R-OT-01)
  J('4', '2026-10-30', 'Nim Kumari Shahu', '09:00', '12:00', 3),       // other month
  J('5', '2026-11-26', 'Bina', '09:00', '12:00', 3),                  // someone else
] as never[]
const marks = {
  '2026-11-20_id:e1': { status: 'absent' },
  '2026-11-21_id:e1': { status: 'on_leave', category: 'Sick Leave', approval: 'approved' },
  '2026-11-22_id:e1': { status: 'on_leave', category: 'Half Day', approval: 'approved' },
  '2026-11-23_id:e1': { status: 'on_leave', category: 'Annual Leave', approval: 'rejected' },
  '2026-11-24_id:e2': { status: 'absent' },
} as never
const m = myMonth(emp, jobs, marks, '2026-11')
eq([m.workDays, m.jobs, m.hours, m.ot], [2, 3, 9, 2], 'November: 2 days, 3 jobs (team job counts), 9 h, 2 h OT after 8 PM')
eq([m.absentDays, m.leaveDays, m.halfDays], [1, 1, 1], 'absent 1, sick 1, half day 1; rejected leave and other people not counted')
eq(m.days[0].date, '2026-11-26', 'latest day first')
eq(/<MyMonthCard emp=\{person\}/.test(readFileSync('src/pages/MyDuties.tsx', 'utf8')), true, 'My month on My Duties')
