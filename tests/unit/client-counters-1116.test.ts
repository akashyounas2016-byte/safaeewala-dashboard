// R-DATA-13 (2026-11-16): "Office ABC Trading DMCC" showed 25 visits / AED 564 (Total Revenue 0.6k) on the
// Clients screen while its profile had nothing — the counters stored when it was registered from old sheet rows.
import { extractAllClientsFromDailyJobs } from '@/lib/clientDataSync'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const abc = {
  id: 'dj-cloudtestabc', full_name: 'Cloud Test ABC Trading', building_name: 'Cloud Test ABC Trading', area: 'JLT', city: 'Dubai', phone: '', whatsapp: '',
  email: '', nationality: '', access_notes: '', pet_info: '', remarks: '', notes: '', source: 'monthly',
  total_bookings: 25, total_spent: 564, last_service: '2027-11-12', created_at: '2026-11-12T18:28:16Z',
} as unknown as Client

const none = extractAllClientsFromDailyJobs([], [abc])[0]
eq([none.total_bookings, none.total_spent, none.last_service], [0, 0, undefined], 'no rows on the sheet → 0 visits, AED 0, no last service (old stored numbers ignored)')

const row = { id: 'j', date: '2026-11-20', staff_name: 'Cloud Test Misbah', address: 'Cloud Test ABC Trading', area: 'JLT', charges: 120, received: 0, payment_mode: 'Monthly', remarks: 'Monthly Contract', start_time: '09:00', end_time: '13:00', client_id: 'dj-cloudtestabc' } as unknown as DailyJob
const one = extractAllClientsFromDailyJobs([row], [abc])[0]
eq([one.total_bookings, one.total_spent, one.last_service], [1, 120, '2026-11-20'], 'with rows → counted from the rows')
