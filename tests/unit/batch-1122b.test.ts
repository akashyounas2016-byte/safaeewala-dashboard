// Audit follow-up 2026-11-22: R-SCHED-28, R-OPS-11, R-OPS-12, R-FIN-16, R-FIN-17, R-ALERT-06
import { readFileSync } from 'node:fs'
import { addMonthsYMD } from '@/lib/clientContracts'
import { weeklyReportText } from '@/lib/weeklyReport'
import { clientMoneySummary } from '@/lib/clientAdvance'
import { runDataHealth } from '@/lib/dataHealth'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
eq([addMonthsYMD('2026-11-30', 3), addMonthsYMD('2027-01-31', 1), addMonthsYMD('2026-12-15', 12)], ['2027-02-28', '2027-02-28', '2027-12-15'], 'renew by whole months, month end kept (R-ALERT-06)')

const j = (id: string, date: string, charges: number, received: number, extra: Partial<DailyJob> = {}) => ({ id, date, staff_name: 'Asmita Tamang', address: 'TEST Villa', start_time: '09:00 AM', end_time: '11:00 AM', duty_hours: 2, charges, received, payment_mode: 'Cash', remarks: '', ...extra }) as DailyJob
const client = { id: 'c1', full_name: 'TEST Villa', building_name: 'TEST Villa', phone: '0501234567', area: 'X', city: 'Dubai' } as unknown as Client
const jobs = [j('a', '2026-11-20', 100, 150), j('b', '2026-11-21', 200, 0)]
const sum = clientMoneySummary(client, jobs, [], [])
eq([sum.billed, sum.paid, sum.pending], [300, 150, 200], 'one money summary: billed, paid, pending (R-FIN-17)')

const text = weeklyReportText({ dailyJobs: jobs, clients: [client], today: '2026-11-22', leads: 4, clicks: 9 })
eq(/Jobs: 2/.test(text) && /Billed: AED 300/.test(text) && /Website leads: 4/.test(text) && /WhatsApp clicks: 9/.test(text), true, 'weekly report text (R-OPS-12)')

const zero = j('z', '2026-11-21', 0, 0)
const health = runDataHealth({ clients: [{ ...client, service_mode: 'biweekly', biweekly_plan: { days: ['Monday'], day_schedules: { Monday: { startTime: '09:00', endTime: '11:00', cleaner: '', duration: 2 } }, start_date: '2026-11-01', months: 1 } } as Client], employees: [{ id: 'e', full_name: 'Asmita Tamang', role: 'cleaner', status: 'active' } as never], dailyJobs: [zero], invoices: [], today: '2026-11-22', unsyncedChanges: 0 })
const by = (id: string) => health.find(h => h.id === id)?.items.length
eq([by('zero-charge'), by('no-rate')], [1, 1], 'Data health: jobs with no charges, Bi-Weekly client without a rate (R-OPS-11)')

const form = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq(/R-SCHED-28/.test(form) && /Charges \/ Hr for/.test(form), true, 'Bi-Weekly days need a rate (R-SCHED-28)')
const prof = readFileSync('src/pages/ClientProfile.tsx', 'utf8')
eq(/settleFromAdvance/.test(prof) && /\+\{n\} mo/.test(prof), true, 'profile: settle from advance (R-FIN-16), renew buttons (R-ALERT-06)')

// R-SCHED-29 (A30): replacement banner also for Bi-Weekly clients
import { monthlyJobsNeedingCover } from '@/lib/excelSheet/replacement'
const bw = { ...client, service_mode: 'biweekly', biweekly_plan: { days: ['Friday'], day_schedules: {}, start_date: '2026-11-01', months: 3 } } as unknown as Client
const cover = monthlyJobsNeedingCover([j('r1', '2026-11-20', 100, 0, { staff_name: 'Ambika' })], '2026-11-20', new Set(['ambika']), [bw])
eq(cover.map(c => [c.cleaner, c.rows.length]), [['Ambika', 1]], 'absent cleaner on a Bi-Weekly job → replacement banner (R-SCHED-29)')
