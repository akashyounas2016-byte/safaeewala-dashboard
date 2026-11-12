// 2026-11-12: contract End date + validity (R-SCHED-11); no "Unassigned" from a booking (R-SCHED-10);
// Clients list shows two rows + See All, widgets in their own section (UX-144)
import { readFileSync } from 'node:fs'
import { getScheduledMonthlyShiftsForDate, contractWindowOf } from '@/lib/clientDataSync'
import { CONTRACTS_KEY, contractDateError, contractOfClient, contractValidity, saveClientContract } from '@/lib/clientContracts'
import { jobFromBooking } from '@/lib/bookingSync'
import type { Booking, Client, RecurringContract } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
localStorage.removeItem(CONTRACTS_KEY)
localStorage.removeItem('safaeewala_removed_monthly_visits')

// ── R-SCHED-11: End date ──
const client = {
  id: 'ce1', full_name: 'TEST End Client', building_name: 'TEST Tower', area: 'Marina', service_days: ['Wednesday'],
  scheduled_time: '09:00 AM', end_time: '12:00 PM', duration_hours: 3, preferred_cleaner: '', source: 'monthly',
  created_at: '2026-11-01T06:00:00.000Z',
} as unknown as Client
saveClientContract({ clientName: 'TEST End Client', details: { serviceType: 'Regular Cleaning', amount: 900, frequency: 'monthly', startDate: '2026-11-04', endDate: '2026-11-25', notes: '' }, active: true })
const list = () => JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]') as RecurringContract[]
eq(contractOfClient('TEST End Client')?.endDate, '2026-11-25', 'the End date is saved on the contract')
eq(contractWindowOf(client, list()), { start: '2026-11-04', end: '2026-11-25' }, 'visits window = Contract Start … Contract End')
const due = (d: string) => getScheduledMonthlyShiftsForDate(d, [client], []).pendingSyncCount
eq([due('2026-10-28'), due('2026-11-04'), due('2026-11-25'), due('2026-12-02')], [0, 1, 1, 0], 'no visit before the start or after the end; both ends included')
eq([contractDateError({ startDate: '2026-11-10', endDate: '2026-11-01' }) !== '', contractDateError({ startDate: '2026-11-10', endDate: '' }), contractDateError({ startDate: '2026-11-10', endDate: '2026-11-10' })],
  [true, '', ''], 'an End before the Start is refused; no End = open-ended')
eq([contractValidity({ startDate: '2026-12-01' }, '2026-11-12'), contractValidity({ startDate: '2026-11-01', endDate: '2026-11-30' }, '2026-11-12'), contractValidity({ startDate: '2026-01-01', endDate: '2026-10-31' }, '2026-11-12')],
  ['upcoming', 'running', 'ended'], 'validity: not started / running / ended')
const card = readFileSync('src/components/clients/ContractDetailsCard.tsx', 'utf8')
const tab = readFileSync('src/pages/MonthlyClients.tsx', 'utf8')
eq([/name="contract_end"/.test(card), /Contract End Date \(optional\)/.test(tab), /contractDateError\(contract\)/.test(readFileSync('src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'utf8'))],
  [true, true, true], 'End date on the Contract card, in Monthly Clients → Contracts, checked before saving')

// ── R-SCHED-10: a booking without a cleaner ──
const job = jobFromBooking({ id: 'b1', client_name: 'TEST Booking', service_address: 'TEST Bldg', scheduled_date: '2026-11-12', scheduled_time: '10:00', duration_hours: 2, total_amount: 0, status: 'confirmed', frequency: 'monthly' } as unknown as Booking, '')
eq(job.staff_name, '', 'a booking without a cleaner adds its job with no cleaner, never "Unassigned"')

// ── UX-144: Clients screen ──
const page = readFileSync('src/pages/Clients.tsx', 'utf8')
eq([/const CLIENT_CARDS_PREVIEW = 6/.test(page), /cardIdx >= 4 \? 'max-xl:hidden' : cardIdx >= 2 \? 'max-md:hidden'/.test(page), /See All \(\$\{filtered\.length\} clients\)/.test(page), (page.match(/\{renderInsights\(\)\}/g) || []).length, /aria-label="Client insights"/.test(page)],
  [true, true, true, 2, true], 'two rows of clients, See All, and the widgets in their own Client Insights section (cards and table view)')
