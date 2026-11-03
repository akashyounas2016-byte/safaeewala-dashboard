// Clients / Monthly Clients audit 2026-11-03 (CM-01 … CM-06, UX-67)
import fs from 'node:fs'
import { isMonthlyClient } from '@/lib/clientDataSync'
import { calendarDate } from '@/lib/dubaiTime'
import { cleanerPalette, cleanerInitials } from '@/lib/cleanerColors'
import type { Client } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const client = (extra: Partial<Client>) => ({ id: 'c1', full_name: 'Villa 9', phone: '', area: '', city: '', total_bookings: 0, total_spent: 0, created_at: '', ...extra }) as Client

// CM-06: a word in a note does not make a client monthly; the schedule does
eq(isMonthlyClient(client({ remarks: 'monthly payment pending' })), false, 'remark "monthly" keeps a standard client standard')
eq(isMonthlyClient(client({ service_days: ['Monday'] })), true, 'service days make a monthly client')
eq(isMonthlyClient(client({ source: 'monthly' })), true, 'monthly source makes a monthly client')

// CM-05: first and last day of a month never shift a day in Dubai (UTC+4)
eq([calendarDate(new Date(2026, 10, 1)), calendarDate(new Date(2026, 11, 0))], ['2026-11-01', '2026-11-30'], 'month range is the calendar month')

// UX-67: same cleaner, same colour on every card
eq(cleanerPalette('Ambika') === cleanerPalette('ambika'), true, 'cleaner colour ignores letter case')
eq(cleanerInitials('Rupa Kumari'), 'RK', 'initials')

// CM-02: no demo contracts are seeded any more; old ones are filtered out
const mc = fs.readFileSync('src/pages/MonthlyClients.tsx', 'utf8')
eq(/safeLocalStorageGet<RecurringContract\[\]>\('safaeewala_recurring_contracts', \[\]\)/.test(mc), true, 'contracts start empty')
eq(/withoutDemoContracts\(/.test(mc), true, 'demo contracts are left out')
eq(/toISOString\(\)\.split\('T'\)\[0\]/.test(mc), false, 'no UTC date strings on Monthly Clients')

// CM-01: a profile built from a booking / job row is saved as a client on edit
const profile = fs.readFileSync('src/pages/ClientProfile.tsx', 'utf8')
eq(/else addClient\(\{ \.\.\.client, \.\.\.patch, id: client\.id \}\)/.test(profile), true, 'edit of an unsaved client adds it')
