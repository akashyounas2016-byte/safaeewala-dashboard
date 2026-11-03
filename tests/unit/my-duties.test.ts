// R-SEC-05 — My Duties: a cleaner sees only their jobs, a driver only their route; field staff open nothing else
import fs from 'node:fs'
import { cleanerDuties, dutyKindOf, isFieldStaff, mapsSearchUrl } from '@/lib/duties'
import { buildRouteSites } from '@/lib/driverRoutes'
import type { DailyJob, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const emp = (id: string, full_name: string, role: string) => ({ id, full_name, role, status: 'active' }) as unknown as Employee
const ambika = emp('e1', 'Ambika', 'cleaner')
const rupa = emp('e2', 'Rupa', 'cleaner')
const ali = emp('d1', 'Ali Driver', 'driver')
const sup = emp('s1', 'Sana', 'supervisor')

// Who is field staff, and which duties they get
eq([dutyKindOf(ambika), dutyKindOf(ali), dutyKindOf(sup), dutyKindOf(undefined)], ['cleaner', 'driver', 'cleaner', null], 'duty kind by staff role')
eq(isFieldStaff('employee', ambika), true, 'cleaner login is field staff')
eq(isFieldStaff('employee', ali), true, 'driver login is field staff')
eq(isFieldStaff('employee', sup), false, 'supervisor keeps the employee screens')
eq(isFieldStaff('employee', undefined), false, 'unlinked login is not field staff')
eq(isFieldStaff('manager', ambika), false, 'manager linked to a staff record keeps manager screens')
eq(isFieldStaff('admin', ali), false, 'admin is never limited')

// Cleaner duties: own jobs only, in time order, team, cash, driver from the day plan
const day = '2026-11-03'
const job = (id: string, staff: string, start: string, extra: Partial<DailyJob> = {}) =>
  ({ id, date: day, staff_name: staff, start_time: start, end_time: '', address: `Villa ${id}`, area: 'JLT', charges: 100, received: 0, payment_mode: 'Online', duty_hours: 3, ...extra }) as unknown as DailyJob
const jobs = [
  job('j2', 'Ambika', '02:00 PM'),
  job('j1', 'Ambika, Rupa', '09:00 AM', { payment_mode: 'Cash', charges: 250, received: 50 }),
  job('j3', 'Rupa', '10:00 AM'),
  job('j4', 'Rupak', '11:00 AM'),
  job('j5', 'Ambika', '08:00 AM', { date: '2026-11-04' }),
]
const sites = buildRouteSites(jobs, day)
const siteOfJ1 = sites.find(s => s.jobIds.includes('j1'))!
const plan = { assignments: { [siteOfJ1.key]: 'd1' }, shifts: {}, sent: {} }
const mine = cleanerDuties(jobs, ambika, day, plan, [ambika, rupa, ali])
eq(mine.map(d => d.job.id), ['j1', 'j2'], "only Ambika's jobs that day, earliest first")
eq(mine[0].teammates, ['Rupa'], 'team mates listed without herself')
eq(mine[0].cashToCollect, 200, 'cash still due on a Cash job')
eq(mine[1].cashToCollect, 0, 'no cash on an Online job')
eq(mine[0].driver?.name, 'Ali Driver', 'driver who drops at that site')
eq(cleanerDuties(jobs, rupa, day).map(d => d.job.id), ['j1', 'j3'], 'Rupa never sees Rupak (whole names, R-SYNC-04)')

eq(mapsSearchUrl('Villa 1', 'JLT'), 'https://www.google.com/maps/search/?api=1&query=Villa%201%2C%20JLT%2C%20Dubai', 'maps link')

// Installable on Android (UX-65)
const html = fs.readFileSync('index.html', 'utf8')
eq(/rel="manifest"/.test(html) && /viewport-fit=cover/.test(html), true, 'manifest and safe-area viewport')
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'))
eq([manifest.display, manifest.start_url], ['standalone', '/'], 'manifest opens like an app')
