// 2026-11-15 Monthly audit (R-SCHED-14). Live cases reproduced with "Cloud Test" clients:
// "Monthly A" got 2–3 visits per date (one without a cleaner), "Unassigned" blocked visits as if it were a
// cleaner, and a visit moved to another date / address came back on its old date.
import { readFileSync } from 'node:fs'
import {
  scheduledAddressOf, getScheduledMonthlyShiftsForDate, syncMonthlySchedulesToDailyJobs, markInitialDataLoaded,
  extractMonthlyClientsFromDailyJobs, extractAllClientsFromDailyJobs, rememberMovedMonthlyVisits, REMOVED_VISITS_KEY,
} from '@/lib/clientDataSync'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const client = (extra: Record<string, unknown>) => ({
  id: 'ct1', full_name: 'Cloud Test Monthly A', building_name: '', apartment: '', area: 'JLT', city: 'Dubai', source: 'monthly',
  service_days: ['Tuesday'], scheduled_time: '09:00', end_time: '13:00', duration_hours: 4, preferred_cleaner: 'Cloud Test Ishwor',
  day_cleaner_assignments: { Tuesday: 'Cloud Test Ishwor' }, phone: '', whatsapp: '', email: '', nationality: '', access_notes: '',
  pet_info: '', remarks: 'Monthly Contract', notes: '', total_bookings: 0, total_spent: 0, created_at: '2026-11-15', ...extra,
}) as unknown as Client
const TUE = '2026-11-24'
markInitialDataLoaded()

// ── 1. "Monthly" in the client's own name is kept ──
eq(scheduledAddressOf(client({})), 'Cloud Test Monthly A', 'name with "Monthly" is not cut to "Cloud Test A"')
eq(scheduledAddressOf(client({ full_name: 'Cloud Test Villa (Monthly)' })), 'Cloud Test Villa', '"(Monthly)" tag still removed')

// ── 2. One visit per client per date, with its cleaner ──
const jobs: DailyJob[] = []
const add = (j: Omit<DailyJob, 'id' | 'created_at'>) => jobs.push({ ...j, id: `j${jobs.length}`, created_at: '' } as DailyJob)
const cA = client({})
syncMonthlySchedulesToDailyJobs(TUE, [cA], jobs, add)
eq(jobs.map(j => j.staff_name), ['Cloud Test Ishwor'], 'first sync: one visit with the cleaner')
eq(getScheduledMonthlyShiftsForDate(TUE, [cA], jobs).pendingSyncCount, 0, 'its own visit is found again')
// a new screen / new session (session memory does not help) still adds nothing
const again = syncMonthlySchedulesToDailyJobs(TUE, [{ ...cA, id: 'ct1-copy' } as Client], jobs, add)
eq([again.insertedCount, jobs.length], [0, 1], 'no second visit without a cleaner')

// ── 3. Rows the sync wrote are not a second "client" from history ──
const sums = extractMonthlyClientsFromDailyJobs([{ ...jobs[0], address: scheduledAddressOf(cA) }], 'all', [cA])
eq(sums.map(s => s.matchedClientId), ['ct1'], 'visit rows belong to the registered client')

// Live 2026-11-15: "Zayan" (building "Villa# 06") showed twice on Monthly Clients — the copy made from its
// rows ("Villa# 06 - Zayan") was the one edited, so nothing reached the real client
const zayan = client({ id: 'ctz', full_name: 'Cloud Test Zayan', building_name: 'Villa# 06', day_cleaner_assignments: { Monday: 'Cloud Test Ambika' }, service_days: ['Monday'] })
const zRow = { id: 'z1', date: '2026-11-23', staff_name: 'Cloud Test Ambika', start_time: '09:00', end_time: '12:00', address: scheduledAddressOf(zayan), payment_mode: 'Monthly', remarks: 'Monthly Contract' } as unknown as DailyJob
eq(extractMonthlyClientsFromDailyJobs([zRow], 'all', [zayan]).map(s => s.matchedClientId), ['ctz'], 'building + name visit rows belong to the real client')
const all = extractAllClientsFromDailyJobs([zRow], [zayan])
eq(all.filter(c => /zayan/i.test(c.full_name)).map(c => c.id), ['ctz'], 'Zayan is listed once — the real client, which is the one edited')

// ── 4. Own visit at the same time is not a "clash" ──
const own: DailyJob[] = [{ id: 'x', date: TUE, staff_name: 'Cloud Test Ishwor', start_time: '09:00', end_time: '13:00', address: 'Cloud Test Monthly A', payment_mode: 'Monthly', remarks: 'Monthly Contract' } as unknown as DailyJob]
const before = own.length
syncMonthlySchedulesToDailyJobs('2026-12-01', [cA], [{ ...own[0], date: '2026-12-01' }], j => own.push(j as DailyJob))
eq(own.length, before, 'existing visit at the same time → nothing added')

// ── 5. "Unassigned" is no cleaner ──
const out: DailyJob[] = []
const cU = client({ id: 'ct2', full_name: 'Cloud Test Unassigned', preferred_cleaner: 'Unassigned', day_cleaner_assignments: { Tuesday: 'Unassigned' } })
const cQ = client({ id: 'ct3', full_name: 'Cloud Test Qamar', preferred_cleaner: 'Unassigned', day_cleaner_assignments: { Tuesday: 'Unassigned' } })
syncMonthlySchedulesToDailyJobs('2026-12-08', [cU, cQ], [], j => out.push(j as DailyJob))
eq(out.map(j => /already booked/.test(j.remarks || '')), [false, false], 'no "⚠ Unassigned is already booked" warning')

// ── 6. A visit moved to another date / address does not come back ──
localStorage.removeItem(REMOVED_VISITS_KEY)
const visit = { id: 'mv', date: '2026-12-15', staff_name: 'Cloud Test Ishwor', start_time: '09:00', end_time: '13:00', address: 'Cloud Test Monthly A', payment_mode: 'Monthly', remarks: 'Monthly Contract' } as unknown as DailyJob
const moved = { ...visit, date: '2026-12-16' }
rememberMovedMonthlyVisits(visit, moved, [cA])
eq(getScheduledMonthlyShiftsForDate('2026-12-15', [cA], [moved]).pendingSyncCount, 0, 'date changed → not added again on the old date')
localStorage.removeItem(REMOVED_VISITS_KEY)
const renamed = { ...visit, date: '2026-12-22', address: 'Cloud Test Other Villa' }
rememberMovedMonthlyVisits({ ...visit, date: '2026-12-22' }, renamed, [cA])
eq(getScheduledMonthlyShiftsForDate('2026-12-22', [cA], [renamed]).pendingSyncCount, 0, 'address changed → client visit not added again')
localStorage.removeItem(REMOVED_VISITS_KEY)
rememberMovedMonthlyVisits({ ...visit, date: '2026-12-29' }, { ...visit, date: '2026-12-29', start_time: '10:00' }, [cA])
eq(JSON.parse(localStorage.getItem(REMOVED_VISITS_KEY) || '[]').length, 0, 'time / cleaner change only → nothing remembered')

// ── wiring ──
eq(/rememberMovedMonthlyVisits\(before, \{ \.\.\.before, \.\.\.sanitizedPatch \}/.test(readFileSync('src/store/DataContext.tsx', 'utf8')), true, 'every job edit (Daily Job Sheet + Excel) goes through it')
eq(/R-SCHED-14/.test(readFileSync('rules.md', 'utf8')), true, 'rule written in rules.md')
