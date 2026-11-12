// 2026-11-12: a 9 AM – 8 PM job got a false "Ends before it starts" check (R-JOB-02); Bi-Weekly and Monthly
// clients: visits added only inside their dates, removed with the client (R-SCHED-07, R-SCHED-11, R-SCHED-12)
import { buildRowChecks } from '@/lib/jobChecks'
import { getScheduledMonthlyShiftsForDate, contractOffJobs } from '@/lib/clientDataSync'
import type { Client, DailyJob, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const emps = [{ id: 'e1', full_name: 'Dipa Kumari Karki' }] as Employee[]
const job = (id: string, start: string, end: string) => ({ id, date: '2026-11-12', staff_name: 'Dipa Kumari Karki', start_time: start, end_time: end, address: `apt# ${id}`, charges: 100, received: 0, payment_mode: 'Cash' }) as unknown as DailyJob
const checks = buildRowChecks([job('a', '09:00 AM', '08:00 PM'), job('b', '01:00 PM', '08:00 PM'), job('c', '11:30 AM', '01:00 PM'), job('d', '08:00 PM', '09:00 AM'), job('e', '21:00', '06:00')], emps)
eq([checks.has('a'), checks.has('b'), checks.has('c')], [false, false, false], '9 AM – 8 PM, 1 PM – 8 PM and 11:30 AM – 1 PM have no check (AM / PM read)')
eq([checks.get('d'), checks.get('e')], [['Ends before it starts — check the times (overnight shift?)'], ['Ends before it starts — check the times (overnight shift?)']], 'a shift really ending before it starts is still flagged (12 h and 24 h times)')

// Bi-Weekly: Monday + Thursday every other week from 16 Nov 2026 for 2 months
localStorage.removeItem('safaeewala_recurring_contracts')
localStorage.removeItem('safaeewala_removed_monthly_visits')
const day = { startTime: '09:00 AM', endTime: '01:00 PM', cleaner: '', duration: 4 }
const bi = {
  id: 'bw1', full_name: 'TEST BiWeekly Client', building_name: 'TEST Tower', area: 'Marina', service_mode: 'biweekly', contract_active: true, created_at: '2026-11-12T06:00:00Z',
  biweekly_plan: { days: ['Monday', 'Thursday'], day_schedules: { Monday: day, Thursday: day }, start_date: '2026-11-16', months: 2, every_weeks: 2 },
} as unknown as Client
const due = (d: string, c: Client, jobs: DailyJob[] = []) => getScheduledMonthlyShiftsForDate(d, [c], jobs).pendingSyncCount
eq([due('2026-11-09', bi), due('2026-11-16', bi), due('2026-11-19', bi), due('2026-11-23', bi), due('2026-11-30', bi), due('2027-01-18', bi)], [0, 1, 1, 0, 1, 0],
  'Bi-Weekly: nothing before the start, every other week only, nothing after the contract')
eq(due('2026-11-16', { ...bi, contract_active: false } as Client), 0, 'Contract Off → no visits')
const visit = { id: 'v1', date: '2026-11-30', staff_name: '', start_time: '09:00 AM', end_time: '01:00 PM', address: 'TEST Tower Apt 101 - TEST BiWeekly Client', payment_mode: 'Cash', remarks: '(Bi-Weekly Schedule)', received: 0, charges: 0 } as unknown as DailyJob
eq(contractOffJobs(bi, [visit], '2026-11-12').map(j => j.id), ['v1'], 'deleting the Bi-Weekly client removes its unpaid visits from today on (R-SCHED-12)')

// Monthly: Tuesday + Saturday, added today
const mo = {
  id: 'mo1', full_name: 'TEST Monthly Client', building_name: 'TEST Villa', area: 'JLT', service_mode: 'monthly', source: 'monthly', contract_active: true, created_at: '2026-11-12T06:00:00Z',
  service_days: ['Tuesday', 'Saturday'], scheduled_time: '09:00 AM', end_time: '01:00 PM', duration_hours: 4, preferred_cleaner: '', day_schedules: { Tuesday: day, Saturday: day },
} as unknown as Client
eq([due('2026-11-10', mo), due('2026-11-14', mo), due('2026-11-17', mo), due('2026-11-16', mo)], [0, 1, 1, 0], 'Monthly: from the day it was added, on its days only')
const mVisit = { id: 'v2', date: '2026-11-14', staff_name: '', start_time: '09:00 AM', end_time: '01:00 PM', address: 'TEST Villa - TEST Monthly Client', payment_mode: 'Monthly', remarks: '(Monthly Schedule)', received: 0, charges: 0 } as unknown as DailyJob
eq([getScheduledMonthlyShiftsForDate('2026-11-14', [mo], [mVisit]).alreadySyncedCount, contractOffJobs(mo, [mVisit], '2026-11-12').length], [1, 1], 'its visit is recognised, and goes when the client is deleted')
