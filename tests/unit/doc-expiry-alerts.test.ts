// R-EMP-04: document alerts start 30 days before expiry; an impossible year (0227) asks for a fix, it is not "expired"
import { readFileSync } from 'node:fs'
import { employeeDocAlerts } from '@/lib/alerts'
import { buildAgencyNotifications } from '@/lib/agencyAlerts'
import { addDays, todayDubai } from '@/lib/dubaiTime'
import { daysUntil, isWrongDocDate, DOC_ALERT_DAYS } from '@/lib/utils'
import type { Agency, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const t = todayDubai()
const emp = (p: Partial<Employee>) => ({ id: 'e1', full_name: 'TEST Misbah', status: 'active', ...p }) as Employee

eq(DOC_ALERT_DAYS, 30, 'window is 30 days')
eq([isWrongDocDate('0227-08-04'), isWrongDocDate('2027-08-04'), isWrongDocDate('')], [true, false, false], 'year 0227 is a typo, 2027 is fine')
eq(daysUntil('0227-08-04'), Infinity, 'a typo year never counts as expired')

const misbah = employeeDocAlerts([emp({ visa_expiry: '2027-11-09', work_permit_expiry: '0227-08-04' })])
eq(misbah.map(a => a.title), ['TEST Misbah: Work Permit date looks wrong'], 'Misbah case: no "expired", one "fix the date" alert')
eq(misbah[0].severity, 'medium', 'not high priority')
eq(employeeDocAlerts([emp({ visa_expiry: addDays(t, 60) })]).length, 0, '60 days left: no alert (was flagged at 90)')
eq(employeeDocAlerts([emp({ visa_expiry: addDays(t, 25) })]).length, 1, '25 days left: alert')
eq(employeeDocAlerts([emp({ visa_expiry: addDays(t, -3) })])[0].severity, 'high', 'expired: high')

const ag = { id: 'a1', name: 'TEST Agency', status: 'active', company_type: 'Parent Company', payouts: [{ status: 'paid', paid_date: t }] } as unknown as Agency
const staffAlerts = buildAgencyNotifications([ag], [emp({ agency_id: 'a1', work_permit_expiry: '0227-08-04' })], () => {})
eq(staffAlerts.some(n => /staff document/.test(n.title)), false, 'agency staff alert ignores a typo year')

const form = readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')
eq(/isWrongDocDate\(d\)/.test(form) && /has a wrong year/.test(form), true, 'the employee form refuses a typo year')
const list = readFileSync('src/pages/Employees.tsx', 'utf8')
eq(/< 90\b/.test(list) || /<90 days/.test(list), false, 'no 90-day window left on Employees')
