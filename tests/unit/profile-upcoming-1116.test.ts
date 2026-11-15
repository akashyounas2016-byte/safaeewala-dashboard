// R-SCHED-15 (2026-11-16): the client profile shows the schedule's visits of the next 4 weeks, not only rows
// already on the sheet ("Villa# 6 - Qamar": Wed / Fri schedule, profile said "No upcoming visits").
import { readFileSync } from 'node:fs'
import { scheduledVisitsAhead } from '@/lib/clientProfileSummary'
import { markInitialDataLoaded } from '@/lib/clientDataSync'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
markInitialDataLoaded()
const qamar = {
  id: 'cq', full_name: 'Cloud Test Qamar', building_name: 'Villa# 6', apartment: '', area: 'Mirdif', city: 'Dubai', phone: '', whatsapp: '', email: '',
  nationality: '', access_notes: '', pet_info: '', remarks: '', notes: '', total_bookings: 0, total_spent: 0, created_at: '2026-11-11T00:00:00Z',
  service_days: ['Wednesday', 'Friday'], scheduled_time: '09:00', end_time: '13:00', duration_hours: 4, preferred_cleaner: 'Cloud Test Nobel',
} as unknown as Client

const v = scheduledVisitsAhead(qamar, [], '2026-11-16')
eq([v.length, v[0].date, v[0].cleaners, v[0].status, v[1].date], [8, '2026-11-18', 'Cloud Test Nobel', 'scheduled', '2026-11-20'], 'Wed + Fri for 4 weeks, with the cleaner')

const onSheet = [{ id: 'j1', date: '2026-11-18', staff_name: 'Cloud Test Nobel', start_time: '09:00', end_time: '13:00', address: 'Villa# 6 - Cloud Test Qamar', payment_mode: 'Monthly', remarks: 'Monthly Contract', client_id: 'cq' } as unknown as DailyJob]
eq(scheduledVisitsAhead(qamar, onSheet, '2026-11-16').map(x => x.date).includes('2026-11-18'), false, 'a visit already on the sheet is not listed twice')
eq(scheduledVisitsAhead({ ...qamar, contract_active: false } as Client, [], '2026-11-16').length, 0, 'Contract Off → nothing ahead')
localStorage.setItem('safaeewala_recurring_contracts', JSON.stringify([{ id: 'k', clientName: 'Cloud Test Qamar', status: 'active', startDate: '2026-11-11', endDate: '2026-11-25', frequency: 'monthly', amount: 0 }]))
eq(scheduledVisitsAhead(qamar, [], '2026-11-16').map(x => x.date), ['2026-11-18', '2026-11-20', '2026-11-25'], 'stops at the contract End date')
localStorage.removeItem('safaeewala_recurring_contracts')

const page = readFileSync('src/pages/ClientProfile.tsx', 'utf8')
eq(/scheduledVisitsAhead\(client, clientDailyJobs, todayDubai\(\)\)/.test(page) && /v\.status === 'scheduled'/.test(page), true, 'profile lists them with a "Scheduled" badge')
