// Full CRM audit 2026-11-06: schedule cleaner alert, re-added names, Active Clients window (R-ALERT-02, R-EMP-08, R-CLI-07)
import { readFileSync } from 'node:fs'
import { scheduleCleanerAlerts } from '@/lib/alerts'
import type { Client, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const emp = (full_name: string) => ({ id: 'e-' + full_name, full_name, status: 'active' }) as unknown as Employee
const cl = (o: Partial<Client>) => ({ id: 'c1', full_name: 'TEST Villa 9', service_days: ['Monday'], preferred_cleaner: 'Sita', day_cleaner_assignments: { Monday: 'Sita' }, ...o }) as unknown as Client

eq(scheduleCleanerAlerts([cl({})], []).map(a => a.severity), ['high'], 'deleted cleaner in a monthly schedule → alert')
eq(scheduleCleanerAlerts([cl({})], [emp('Sita Rai')]).length, 0, 'a matching employee (whole word) → no alert')
eq(scheduleCleanerAlerts([cl({ contract_active: false })], []).length, 0, 'contract off → no alert')
eq(scheduleCleanerAlerts([cl({ service_days: [] })], []).length, 0, 'no schedule → no alert')
eq(/scheduleCleanerAlerts\(clients, employees\)/.test(readFileSync('src/store/useAlerts.ts', 'utf8')), true, 'shown in Sidebar → Alerts')

const dc = readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/R-EMP-08[\s\S]{0,200}deletedStaffKeys\.includes\(nameKey\)/.test(dc), true, 'adding an employee takes the name off the deleted list')

const cp = readFileSync('src/pages/Clients.tsx', 'utf8')
eq(/new Date\('2026-01-01'\)/.test(cp), false, 'no fixed date in Active Clients')
eq(/const activeSince = addDays\(todayDubai\(\), -60\)/.test(cp), true, 'active = served in the last 60 days')

// UX-105: Bookings card time "2026-11-06T09:00 AM" was shown raw
import { formatTime } from '@/lib/utils'
eq([formatTime('2026-11-06T09:00 AM'), formatTime('2026-11-06T12:00 PM'), formatTime('2026-11-06T14:30'), formatTime('09:00')], ['09:00 AM', '12:00 PM', '02:30 PM', '09:00 AM'], 'date + time shows the time only')

// UX-105: UI audit fixes
import { daysUntil } from '@/lib/utils'
eq([daysUntil(''), daysUntil(undefined), daysUntil('not a date')], [Infinity, Infinity, Infinity], 'no expiry date = nothing expiring (was 0 = today)')
eq(daysUntil('2000-01-01') < 0, true, 'a past date is still expired')
const modal = readFileSync('src/components/ui/Modal.tsx', 'utf8')
eq(/e\.key !== 'Escape' \|\| openStack\[openStack\.length - 1\] !== me/.test(modal), true, 'Esc closes the popup on top')
eq(/queueMicrotask\(\(\) => window\.dispatchEvent/.test(readFileSync('src/lib/syncQueue.ts', 'utf8') + readFileSync('src/lib/cloudState.ts', 'utf8')), true, 'sync events after the render')
eq(/confirmAsync\(\{ title: 'Delete client'/.test(cp.slice(cp.indexOf('UX-105'))), true, 'Clients table asks before deleting')
