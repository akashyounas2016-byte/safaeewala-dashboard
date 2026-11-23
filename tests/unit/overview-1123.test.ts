// 2026-11-23: Overview redesign — Reports (R-OPS-13), live map (R-OPS-14), no New Booking / Quick Actions (R-OPS-15),
// daily leads cards (R-LEAD-15)
import { readFileSync } from 'node:fs'
import { buildPeriodReport, periodReportCsv, periodReportText, reportRange } from '@/lib/periodReport'
import { buildLivePeople, currentJobOf } from '@/lib/liveOps'
import { countByPeriod } from '@/components/overview/LeadsSummaryCards'
import type { Client, DailyJob, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const today = '2026-11-23'
eq(reportRange('today', today), { from: today, to: today, label: 'Today' }, 'Daily report = today')
eq(reportRange('yesterday', today), { from: '2026-11-22', to: '2026-11-22', label: 'Yesterday' }, 'Yesterday report')
eq(reportRange('7days', today).from, '2026-11-17', 'Last 7 days includes today')

const job = (id: string, date: string, staff: string, charges: number, received: number, extra: Partial<DailyJob> = {}) =>
  ({ id, date, staff_name: staff, address: `Villa ${id}`, area: 'Mirdif', charges, received, duty_hours: 4, start_time: '09:00 AM', end_time: '01:00 PM', payment_mode: 'Cash', ...extra }) as unknown as DailyJob
const jobs = [job('1', today, 'Asha, Bina', 200, 200), job('2', today, 'Asha', 100, 0, { area: 'JVC' }), job('3', '2026-11-22', 'Bina', 300, 100), job('4', '2026-11-10', 'Asha', 50, 0)]
const clients = [{ id: 'c1', created_at: `${today}T08:00:00Z` }, { id: 'c2', created_at: '2026-11-01T08:00:00Z' }] as unknown as Client[]
const r = buildPeriodReport({ period: 'today', today, dailyJobs: jobs, clients, expenses: [{ id: 'e', date: today, amount: 40 } as never], leads: 3, clicks: 5 })
eq([r.jobs, r.cleaners, r.hours, r.billed, r.collected, r.pending, r.expenses, r.newClients], [2, 2, 8, 300, 200, 100, 40, 1], 'today: jobs, cleaners, hours, billed, collected, pending, expenses, new clients')
eq(r.topAreas, [{ area: 'JVC', jobs: 1 }, { area: 'Mirdif', jobs: 1 }], 'top areas of the period')
const w = buildPeriodReport({ period: '7days', today, dailyJobs: jobs, clients })
eq([w.jobs, w.billed], [3, 600], 'last 7 days leaves out older jobs')
eq(/Website leads: 3/.test(periodReportText(r)) && /WhatsApp clicks: 5/.test(periodReportText(r)), true, 'WhatsApp text has leads and clicks')
eq(periodReportCsv(r).split('\n')[3], 'Jobs,2', 'CSV one figure per line')

eq(countByPeriod([today, today, '2026-11-22', '2026-11-18', '2026-11-01'], today), { today: 2, yesterday: 1, d7: 4, d30: 5 }, 'leads cards count Today / Yesterday / 7 / 30 days')

const emp = (id: string, full_name: string, role: string) => ({ id, full_name, role, status: 'active' }) as unknown as Employee
const employees = [emp('e1', 'Asha', 'cleaner'), emp('e2', 'Dan', 'driver'), emp('e3', 'Sara', 'csr'), emp('e4', 'Bina', 'cleaner')]
eq(currentJobOf(employees[0], jobs, today, 10 * 60)?.when, 'now', 'a cleaner inside a job time is "now"')
eq(currentJobOf(employees[0], jobs, today, 7 * 60)?.when, 'next', 'before the first job → next')
const nowMs = Date.parse(`${today}T07:00:00Z`)
const people = buildLivePeople({
  employees,
  locations: [
    { employee_id: 'e1', lat: 25.2, lng: 55.3, accuracy: null, speed: null, sharing: true, updated_at: new Date(nowMs - 60_000).toISOString() },
    { employee_id: 'e2', lat: 25.1, lng: 55.2, accuracy: null, speed: 10, sharing: true, updated_at: new Date(nowMs - 20 * 60_000).toISOString() },
    { employee_id: 'e3', lat: 25.0, lng: 55.1, accuracy: null, speed: null, sharing: false, updated_at: new Date(nowMs - 3 * 86400_000).toISOString() },
  ],
  checkins: [{ id: 'x', job_id: '1', date: today, cleaner: 'Bina', status: 'started', lat: 25.3, lng: 55.4, updated_at: new Date(nowMs).toISOString() }],
  dailyJobs: jobs, date: today, nowMs, nowMin: 11 * 60,
})
eq(people.map(p => [p.name, p.role, p.state]), [['Asha', 'cleaner', 'live'], ['Bina', 'cleaner', 'checkin'], ['Dan', 'driver', 'stale']], 'live / last known / last job step; an old position (3 days) is not shown')
eq(people[0].task.startsWith('Working at'), true, 'hover card says what the cleaner is doing now')
eq(people[1].detail.includes('Started'), true, 'the job step shows in the card')

const ov = readFileSync('src/pages/Overview.tsx', 'utf8')
eq(/actionLabel="New Booking"/.test(ov) || /NewBookingModal/.test(ov), false, 'no New Booking on the Overview header (R-OPS-15)')
eq(/Quick Actions<\/h3>/.test(ov), false, 'Quick Actions widget removed')
eq(/<LeadsSummaryCards \/>/.test(ov) && /<ReportsPanel \/>/.test(ov) && /<LiveOpsPanel \/>/.test(ov), true, 'Overview has leads cards, Reports and the live map')
const md = readFileSync('src/pages/MyDuties.tsx', 'utf8')
eq(/const canShare = !!linked\b/.test(md) && /Share my location with the office/.test(md), true, 'cleaners / CSR can share their location on My Duties')
