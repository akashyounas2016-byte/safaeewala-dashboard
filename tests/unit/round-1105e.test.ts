// Round 2026-11-05 (e): Excel colours on the Daily Job Sheet, Add New Booking = Add Job form,
// client cards with in-house / outsourced crew and scoped widgets, Contract Status toggle
import { readFileSync } from 'node:fs'
import type { Client, DailyJob, Employee } from '@/types'
import { rowColorOf } from '@/components/dailyJobSheet/jobSheetUtils'
import { sameJobRow } from '@/lib/excelSheet/rows'
import { bookingFromJobEntry } from '@/lib/bookingSync'
import { clientCrewMix } from '@/lib/clientCrew'
import { contractOffJobs, getScheduledMonthlyShiftsForDate } from '@/lib/clientDataSync'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

const job = (o: Partial<DailyJob>): DailyJob => ({
  id: 'j1', created_at: '', date: '2026-11-05', staff_name: 'Maria', start_time: '09:00', end_time: '12:00', duty_hours: 3,
  address: 'Villa 7', area: 'Jumeirah', material: 'No', charges: 0, received: 0, payment_mode: 'Cash', is_overtime: false, remarks: '', ...o,
})

// R-SYNC-11: an Excel block colour shows on the Daily Job Sheet, and a colour change alone is saved
eq(rowColorOf('emerald')?.bg.startsWith('#'), true, 'Excel block palette key → a colour on the Daily Job Sheet')
eq(rowColorOf('#ffd6e7')?.bg, '#ffd6e7', 'custom hex from Excel → same colour')
eq(rowColorOf('default'), null, 'default → no colour')
eq(rowColorOf(''), null, 'empty → no colour')
eq(sameJobRow(job({ row_color: 'emerald' }), job({ row_color: 'sky' })), false, 'Excel Save sees a colour change (was "Nothing to save")')
eq(/rowColorOf\(job\.row_color\)/.test(src('src/pages/DailyJobSheet.tsx')), true, 'Daily Job Sheet rows use the shared colour')

// R-SYNC-12: Add New Booking uses the Add Job form; the booking is built from that entry
const emps = [{ id: 'e1', full_name: 'Maria' }, { id: 'e2', full_name: 'Joy', agency_id: 'ag1', agency_name: 'Star Services' }] as Employee[]
const clients = [{ id: 'c1', full_name: 'Mrs Ali', building_name: 'Villa 7', area: 'Jumeirah', phone: '0501234567' }] as Client[]
const b = bookingFromJobEntry(job({ address: 'Villa 7', charges: 250, received: 50, staff_name: 'Maria, Joy', remarks: 'Keys at gate' }), clients, emps)
eq([b.client_id, b.client_name, b.service_address], ['c1', 'Mrs Ali', 'Villa 7'], 'client matched by the address the form uses')
eq(b.assigned_crew, ['e1', 'e2'], 'cleaner names → employee ids (R-SYNC-02)')
eq([b.scheduled_date, b.scheduled_time, b.end_time, b.total_amount, b.received_amount], ['2026-11-05', '09:00', '12:00', 250, 50], 'date, time and money carried over')
eq(bookingFromJobEntry(job({ payment_mode: 'Monthly' }), clients, emps).frequency, 'monthly', 'Monthly mode → monthly booking')
const nbm = src('src/components/bookings/NewBookingModal.tsx')
eq(/<AddJobForm/.test(nbm) && /job_entry: j/.test(nbm), true, 'new booking opens the Add Job form and keeps its entry')
eq(/createJobForBooking\(row, matchedClient\?\.area, jobEntry\)/.test(src('src/store/DataContext.tsx')), true, 'the job-sheet row is the Add Job entry')

// UX-95: crew on client cards, scoped widgets
const villa = { id: 'c1', full_name: 'Mrs Ali', building_name: 'Villa 7', area: 'Jumeirah', preferred_cleaner: 'Maria' } as Client
const mix = clientCrewMix(villa, [job({ staff_name: 'Joy', address: 'Villa 7 - Mrs Ali' })], emps)
eq([mix.inHouse, mix.outsourced], [['Maria'], ['Joy']], 'in-house vs outsourced (agency staff)')
const cl = src('src/pages/Clients.tsx')
eq(/const scopeClients = filterType \? filtered : clients/.test(cl), true, 'a selected KPI card scopes the widgets')
eq(/\[\.\.\.scopeBookings\]/.test(cl) && /scopeDue/.test(cl) && /\[\.\.\.scopeClients\]\.sort/.test(cl), true, 'bookings, dues and top clients follow the scope')
eq(/animate-bounce/.test(cl) && /more clients/.test(cl), true, 'expand arrow under the cards')

// R-SCHED-08: Contract Status Off stops the sync and clears synced visits from today on
const monthly = { id: 'm1', full_name: 'Office ABC', building_name: 'Office ABC', area: 'Khawaneej', source: 'monthly', service_mode: 'monthly',
  service_days: ['Thursday'], scheduled_time: '09:00', end_time: '12:00', duration_hours: 3, preferred_cleaner: 'Maria', phone: '', city: 'Dubai',
  total_bookings: 0, total_spent: 0, created_at: '' } as unknown as Client
eq(getScheduledMonthlyShiftsForDate('2026-11-05', [monthly]).shifts.length, 1, 'contract On → Thursday visit is scheduled')
eq(getScheduledMonthlyShiftsForDate('2026-11-05', [{ ...monthly, contract_active: false }]).shifts.length, 0, 'contract Off → nothing syncs')
const synced = [
  job({ id: 'past', date: '2026-11-04', address: 'Office ABC - Office ABC', payment_mode: 'Monthly' }),
  job({ id: 'today', date: '2026-11-05', address: 'Office ABC - Office ABC', payment_mode: 'Monthly' }),
  job({ id: 'paid', date: '2026-11-06', address: 'Office ABC - Office ABC', payment_mode: 'Monthly', received: 100 }),
  job({ id: 'other', date: '2026-11-06', address: 'Villa 9', payment_mode: 'Monthly' }),
]
eq(contractOffJobs(monthly, synced, '2026-11-05').map(j => j.id), ['today'], 'Off removes only this client\'s unpaid visits from today on')
const bi = { ...monthly, id: 'b1', source: undefined, service_mode: 'biweekly', service_days: undefined, contract_active: false,
  biweekly_plan: { days: ['Thursday'], every_weeks: 1, start_date: '2026-11-01', end_date: '2026-12-31', day_schedules: { Thursday: { startTime: '09:00', endTime: '12:00', cleaner: 'Maria', duration: 3 } } } } as unknown as Client
eq(getScheduledMonthlyShiftsForDate('2026-11-05', [bi]).shifts.length, 0, 'Bi-Weekly with contract Off → nothing syncs')
eq(/ContractStatusToggle/.test(src('src/components/clients/ClientModalForm.tsx')) && /ContractStatusToggle/.test(src('src/components/monthlyClients/AddMonthlyClientModalForm.tsx')), true, 'toggle in Edit Client and the Monthly form')
eq(/contract_active boolean/.test(src('supabase/migrations/2026-11-05_client_contract_active.sql')), true, 'migration adds the column')
