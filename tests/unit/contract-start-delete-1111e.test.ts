// 2026-11-11 (round 5): a monthly client's visits start on its contract start date (R-SCHED-11);
// a deleted monthly client leaves no visits, contract or history client behind (R-SCHED-12)
import { readFileSync } from 'node:fs'
import { getScheduledMonthlyShiftsForDate, monthlyStartDateOf } from '@/lib/clientDataSync'
import { CONTRACTS_KEY, removeClientContracts, saveClientContract } from '@/lib/clientContracts'
import type { Client, DailyJob, RecurringContract } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
localStorage.removeItem(CONTRACTS_KEY)
localStorage.removeItem('safaeewala_deleted_clients')

// ── R-SCHED-11 ──
const client = {
  id: 'cs1', full_name: 'TEST Start Client', building_name: 'TEST Villa', area: 'Qusais', service_days: ['Wednesday'],
  scheduled_time: '09:00 AM', end_time: '01:00 PM', duration_hours: 4, preferred_cleaner: 'Nobel', source: 'monthly',
  created_at: '2026-11-11T06:00:00.000Z',
} as unknown as Client
const pending = (date: string, clients: Client[], jobs: DailyJob[] = []) => getScheduledMonthlyShiftsForDate(date, clients, jobs).pendingSyncCount
eq(monthlyStartDateOf(client, []), '2026-11-11', 'no contract → visits start on the day the client was added (Dubai date)')
eq([pending('2026-11-04', [client]), pending('2026-10-28', [client]), pending('2026-11-18', [client])], [0, 0, 1],
  'an older Wednesday opened on the sheet gets no visit; the next Wednesday does')
saveClientContract({ clientName: 'TEST Start Client', details: { serviceType: 'Regular Cleaning', amount: 1000, frequency: 'monthly', startDate: '2026-11-01', notes: '' }, active: true })
eq([monthlyStartDateOf(client, JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]') as RecurringContract[]), pending('2026-11-04', [client]), pending('2026-10-28', [client])],
  ['2026-11-01', 1, 0], 'the contract start date wins (a contract started before the client was added)')
const typed = { id: 'j1', date: '2026-10-28', staff_name: 'Nobel', address: 'TEST Villa - TEST Start Client', start_time: '09:00 AM', end_time: '01:00 PM', payment_mode: 'Monthly', received: 0, charges: 0 } as unknown as DailyJob
eq(getScheduledMonthlyShiftsForDate('2026-10-28', [client], [typed]).alreadySyncedCount, 1, 'a row already on that date is still shown as the client\'s visit (nothing is hidden)')
eq(monthlyStartDateOf({ ...client, created_at: 'nonsense' } as Client, [], true), '', 'a bad added-on date blocks nothing')

// ── R-SCHED-12 ──
eq([removeClientContracts('TEST Start Client'), (JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]') as RecurringContract[]).length], [1, 0], 'deleting the client removes its contract')
eq(/if \(deletedKeys\.has\(normalizeKey\(s\.name\)\)\) return/.test(readFileSync('src/lib/clientDataSync.ts', 'utf8')), true, 'a deleted client is not brought back from its old visits by the monthly sync')
const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq([/const visits = contractOffJobs\(c, dailyJobs, todayDubai\(\)\)/.test(ctx), /visits\.forEach\(j => removeJobRow\(j\.id\)\)/.test(ctx), /removeClientContracts\(c\.full_name\)/.test(ctx), /dbDelete\('clients', id\)/.test(ctx)],
  [true, true, true, true], 'delete: the row in Supabase, its unpaid visits from today on, and its contract')
