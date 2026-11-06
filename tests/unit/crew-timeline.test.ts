// UX-94: crew timeline (V1) on the Daily Job Sheet + Driver / Status columns
import { readFileSync } from 'node:fs'
import type { DailyJob } from '@/types'
import { buildCrewTimeline, blockPosition, driverNameForJob, jobStatusLabel } from '@/lib/crewTimeline'
import { buildRouteSites } from '@/lib/driverRoutes'
import { mergeColumnOrder, ALL_COLUMNS } from '@/components/dailyJobSheet/jobSheetUtils'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const D = '2026-11-05'
const job = (id: string, staff: string, s: string, e: string, address: string, mode = 'Cash'): DailyJob => ({
  id, created_at: '', date: D, staff_name: staff, start_time: s, end_time: e, duty_hours: 0, address, area: 'Marina',
  material: 'No', charges: 100, received: 0, payment_mode: mode as DailyJob['payment_mode'], is_overtime: false, remarks: '',
})

const jobs = [
  job('a', 'Maria', '08:00', '12:00', 'Office 1204', 'Monthly'),
  job('b', 'Grace', '13:00', '16:00', 'Shop G-03'),
  job('c', 'Grace', '15:00', '18:00', 'Villa 31'),
  job('d', '', '16:00', '19:00', 'Apt 905'),
  job('e', 'Rina', '17:00', '21:30', 'Villa 7', 'Monthly'),
]
const t = buildCrewTimeline(jobs, ['Maria', 'Grace', 'Rina', 'Aisha', 'Nisha'], n => (n === 'Nisha' ? 'absent' : undefined))

eq(t.lanes.map(l => [l.name, l.state]), [['No cleaner', 'open'], ['Maria', 'working'], ['Grace', 'working'], ['Rina', 'working'], ['Aisha', 'available'], ['Nisha', 'absent']],
  'lanes: no-cleaner first, then working by start, then available, then absent')
eq(t.lanes.find(l => l.name === 'Aisha')?.state, 'available', 'R-ATT-01: no job and no mark = Available, not absent')
eq(t.lanes.find(l => l.name === 'Grace')?.blocks.map(b => b.clash), [true, true], 'both overlapping Grace jobs are marked as a clash')
eq(t.lanes.find(l => l.name === 'Maria')?.blocks[0].clash, false, 'a job without overlap is not a clash')
eq(t.issues.map(i => i.kind).sort(), ['clash', 'open'], 'issues: one clash and one job without a cleaner')
eq(t.lanes.find(l => l.name === 'Rina')?.hours, 4.5, 'lane hours add up')
eq([t.startMin / 60, t.endMin / 60], [8, 23], 'axis 09:00–23:00, widened to 08:00 for the 8 AM job (UX-103)')
eq([buildCrewTimeline([], [], () => undefined).startMin / 60, buildCrewTimeline([], [], () => undefined).endMin / 60], [9, 23], 'empty day: 09:00–23:00')
eq(readFileSync('src/components/dailyJobSheet/CrewTimeline.tsx', 'utf8').includes("lanes.filter(l => l.state !== 'available').map"), true, 'UX-103: available cleaners hidden from the timeline')
eq(t.lanes.find(l => l.name === 'Maria')?.blocks[0].monthly, true, 'Monthly jobs get the monthly colour')

const pos = blockPosition(8 * 60, 12 * 60, 7 * 60, 22 * 60)
eq([Math.round(pos.left * 100) / 100, Math.round(pos.width * 100) / 100], [6.67, 26.67], 'block position on the axis')

const team = buildCrewTimeline([job('f', 'Maria, Rina', '09:00', '11:00', 'Villa 2')], [], () => undefined)
eq(team.lanes.map(l => l.name), ['Maria', 'Rina'], 'a team job shows on every cleaner\'s lane')

// Driver from the Drivers day plan, status from My Duties
const sites = buildRouteSites(jobs, D)
const siteA = sites.find(s => s.jobIds.includes('a'))!
const plan = { assignments: { [siteA.key]: 'drv1' }, shifts: {}, sent: {} }
eq(driverNameForJob('a', sites, plan, [{ id: 'drv1', full_name: 'Imran' }]), 'Imran', 'driver name from the day plan')
eq(driverNameForJob('b', sites, plan, [{ id: 'drv1', full_name: 'Imran' }]), '', 'no driver assigned → empty')
const ck = (status: string) => ({ id: '', job_id: 'a', date: D, cleaner: 'maria', status, updated_at: '' })
eq(jobStatusLabel('a', ['Maria'], {}).label, 'Scheduled', 'no check-in → Scheduled')
eq(jobStatusLabel('a', ['Maria'], { 'a|maria': ck('started') } as never).label, 'Started', 'check-in started → Started')
eq(jobStatusLabel('a', ['Maria'], { 'a|maria': ck('done') } as never).tone, 'done', 'check-in done → Done')

// Saved column order: new columns land before Remarks, not at the end
const saved = ALL_COLUMNS.map(c => c.id).filter(id => id !== 'driver' && id !== 'status')
const merged = mergeColumnOrder(saved)
eq(merged.slice(merged.indexOf('payment_mode'), merged.indexOf('payment_mode') + 4), ['payment_mode', 'driver', 'status', 'remarks'], 'Driver / Status placed after Mode')
eq(merged.length, ALL_COLUMNS.length, 'no column lost or doubled')

const page = readFileSync('src/pages/DailyJobSheet.tsx', 'utf8')
eq(/<CrewTimeline/.test(page) && /!isDateRange && \(\s*<CrewTimeline/.test(page), true, 'timeline shown for a single day')
eq(/gradient-card rounded-\[24px\]/.test(page), false, 'header uses the V1 solid colour')
eq(/<ReconciliationWidgets/.test(page) && /<ExpensesAndDriversPanel/.test(page), true, 'bottom widgets untouched')
