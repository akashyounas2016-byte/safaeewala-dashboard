// 2026-11-16 audit fixes: job rows keep their client's id (R-DATA-12); an employee's new name reaches the
// job sheet and the monthly schedules (R-EMP-14). "Cloud Test" records only.
import { readFileSync } from 'node:fs'
import { clientIdForJob, jobMatchesClient, extractAllClientsFromDailyJobs, getScheduledMonthlyShiftsForDate, markInitialDataLoaded } from '@/lib/clientDataSync'
import { renameInStaffText, jobRenamePatches, clientRenamePatches } from '@/lib/employeeRename'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const client = (id: string, extra: Record<string, unknown> = {}) => ({
  id, full_name: `Cloud Test ${id}`, building_name: '', apartment: '', area: 'JLT', city: 'Dubai', phone: '', whatsapp: '', email: '',
  nationality: '', access_notes: '', pet_info: '', remarks: '', notes: '', total_bookings: 0, total_spent: 0, created_at: '', ...extra,
}) as unknown as Client
const job = (extra: Record<string, unknown>) => ({
  id: 'j', date: '2026-11-17', staff_name: 'Cloud Test Rupa', start_time: '09:00', end_time: '13:00', address: '', area: '',
  charges: 0, received: 0, payment_mode: 'Monthly', remarks: 'Monthly Contract', ...extra,
}) as unknown as DailyJob

// ── R-DATA-12: client_id ──
const zayan = client('Zayan', { full_name: 'Cloud Test Zayan', building_name: 'Villa# 06', service_days: ['Tuesday'], preferred_cleaner: 'Cloud Test Rupa', scheduled_time: '09:00', end_time: '13:00', duration_hours: 4 })
const other = client('Other', { full_name: 'Cloud Test Other' })
eq(clientIdForJob({ address: 'Villa# 06 - Cloud Test Zayan', area: '' }, [zayan, other]), 'Zayan', 'visit address → that client')
eq(clientIdForJob({ address: 'Cloud Test', area: '' }, [zayan, other]), undefined, 'fits two clients → left empty')
eq(clientIdForJob({ address: 'Somewhere', area: '', booking_id: 'b1' }, [zayan, other], [{ id: 'b1', client_id: 'Other' }]), 'Other', 'booking row → the booking\'s client')
eq(clientIdForJob({ address: '', area: '' }, [zayan]), undefined, 'no address → nothing')
eq([jobMatchesClient(job({ address: 'Anything', client_id: 'Zayan' }), zayan), jobMatchesClient(job({ address: 'Villa# 06 - Cloud Test Zayan', client_id: 'Other' }), zayan)], [true, false], 'a linked row belongs to its client only')

// renamed client: rows saved before keep belonging to it
const renamed = { ...zayan, full_name: 'Cloud Test Zayan Khan', building_name: 'Villa# 6' } as Client
const oldRow = job({ id: 'r1', address: 'Villa# 06 - Cloud Test Zayan', client_id: 'Zayan' })
const all = extractAllClientsFromDailyJobs([oldRow], [renamed])
eq(all.map(c => c.id), ['Zayan'], 'client renamed → still one client, its rows still its own')
markInitialDataLoaded()
eq(getScheduledMonthlyShiftsForDate('2026-11-17', [renamed], [oldRow]).pendingSyncCount, 0, 'renamed client → no second visit on that day')

// wiring
const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq((ctx.match(/client_id: linkClient\(/g) || []).length, 2, 'Add Job / Excel / import and the start-up monthly sync save client_id')
eq(/sanitizedPatch\.client_id = linkClient\(/.test(ctx) && /client_id: \(b\.client_id/.test(ctx), true, 'address change re-links; booking rows take the booking\'s client')
eq(/add column if not exists client_id text/.test(readFileSync('supabase/migrations/2026-11-16_daily_jobs_client_id.sql', 'utf8')), true, 'migration for the column')

// ── R-EMP-14: rename ──
eq(renameInStaffText('Cloud Test Rupa', 'Cloud Test Rupa', 'Cloud Test Roopa'), 'Cloud Test Roopa', 'single name replaced')
eq(renameInStaffText('Cloud Test Rupa, Asmita', 'cloud test rupa', 'Cloud Test Roopa'), 'Cloud Test Roopa, Asmita', 'team name list: only that cleaner')
eq(renameInStaffText('Cloud Test Rupak', 'Cloud Test Rupa', 'X'), 'Cloud Test Rupak', '"Rupa" never touches "Rupak"')
const jp = jobRenamePatches([
  job({ id: 'a', staff_name: 'Cloud Test Rupa' }),
  job({ id: 'b', staff_name: 'Asmita' }),
  job({ id: 'c', staff_name: 'Cloud Test Rupa, Asmita', charge_split: [{ cleaner: 'Cloud Test Rupa', charges: 50, received: 0, payment_mode: 'Cash' }, { cleaner: 'Asmita', charges: 50, received: 0, payment_mode: 'Cash' }] }),
], 'Cloud Test Rupa', 'Cloud Test Roopa')
eq([...jp.keys()], ['a', 'c'], 'only her rows change')
eq(jp.get('c')?.charge_split?.map(s => s.cleaner), ['Cloud Test Roopa', 'Asmita'], 'Split Mode cleaner renamed too')
const cp = clientRenamePatches([{ ...zayan, day_cleaner_assignments: { Tuesday: 'Cloud Test Rupa' }, day_schedules: { Tuesday: { startTime: '09:00', endTime: '13:00', cleaner: 'Cloud Test Rupa' } } } as Client, other], 'Cloud Test Rupa', 'Cloud Test Roopa')
eq([[...cp.keys()], cp.get('Zayan')?.preferred_cleaner, cp.get('Zayan')?.day_cleaner_assignments, cp.get('Zayan')?.day_schedules?.Tuesday.cleaner],
  [['Zayan'], 'Cloud Test Roopa', { Tuesday: 'Cloud Test Roopa' }, 'Cloud Test Roopa'], 'monthly schedule keeps working after the rename')
eq(/jobRenamePatches\(dailyJobs, oldName, newName\)/.test(ctx) && /clientRenamePatches\(clients, oldName, newName\)/.test(ctx), true, 'Edit Employee runs the rename')
eq(/R-DATA-12/.test(readFileSync('rules.md', 'utf8')) && /R-EMP-14/.test(readFileSync('rules.md', 'utf8')), true, 'rules written')
