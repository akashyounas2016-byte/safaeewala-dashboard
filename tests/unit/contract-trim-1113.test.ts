// 2026-11-13: a monthly client's visit stayed on 28 Dec 2027 after its contract got an End date of 29 Dec 2026.
// Saving the contract dates now takes off the upcoming unpaid visits outside them (R-SCHED-13)
import { readFileSync } from 'node:fs'
import { visitsOutsideContract } from '@/lib/clientDataSync'
import type { Client, DailyJob, RecurringContract } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const client = { id: 'c1', full_name: 'TEST NH Client', building_name: 'TEST NH Client', area: 'NH', service_mode: 'monthly', created_at: '2026-11-12T17:47:57Z' } as unknown as Client
const contract = (startDate: string, endDate: string) => [{ id: 'ct1', clientName: 'TEST NH Client', startDate, endDate, status: 'active' }] as unknown as RecurringContract[]
const v = (id: string, date: string, extra: Partial<DailyJob> = {}) => ({ id, date, staff_name: 'Dinesh Sunar', start_time: '09:00', end_time: '13:00', address: 'TEST NH Client', payment_mode: 'Monthly', remarks: 'Monthly Contract', received: 0, charges: 0, ...extra }) as unknown as DailyJob
const jobs = [v('past', '2026-11-10'), v('in1', '2026-11-17'), v('in2', '2026-12-29'), v('after', '2027-12-28'), v('paid', '2027-01-05', { received: 100 }),
  v('other', '2027-12-28', { address: 'Other Client' }), v('cash', '2027-01-05', { payment_mode: 'Cash', remarks: '' })]
const ids = (c: RecurringContract[], today = '2026-11-13') => visitsOutsideContract(client, jobs, c, today).map(j => j.id)

eq(ids(contract('2026-11-13', '2026-12-29')), ['after'], 'End 29 Dec 2026: the 28 Dec 2027 visit goes; visits up to the End date stay')
eq(ids(contract('2026-11-20', '')), ['in1'], 'Start moved later: the upcoming visit before it goes')
eq(ids(contract('2026-11-01', '2026-11-05')).includes('past'), false, 'past visits stay as work history')
eq(ids(contract('2026-11-13', '2026-11-30')), ['in2', 'after'], 'paid visits, other clients and non-schedule jobs are never touched')
eq(ids([]), [], 'no contract dates → nothing removed')

const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq([/trimVisitsToContract: \(patch, contracts\)/.test(ctx), /saveDeletionSnapshot\(`Contract dates/.test(ctx)], [true, true], 'removal keeps a restore snapshot')
eq(['src/components/clients/ClientModalForm.tsx', 'src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'src/pages/MonthlyClients.tsx'].map(p => /trimVisitsToContract\(/.test(readFileSync(p, 'utf8'))),
  [true, true, true], 'runs when the contract is saved from the client popups and the Contracts tab')
