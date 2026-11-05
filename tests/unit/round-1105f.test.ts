// Round 2026-11-05 (f): Alerts section, Jobs widget white, Clients KPI cards, Recent Bookings audit, Client Profile layout
import { readFileSync } from 'node:fs'
import type { Booking, DailyJob, Employee } from '@/types'
import { buildAlerts, bookingAlerts, employeeDocAlerts } from '@/lib/alerts'
import { normalizeRolePerms, ALL_MODULE_KEYS, moduleForPath } from '@/lib/permissions'
import { upcomingVisits, jobSheetSummary } from '@/lib/clientProfileSummary'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const T = '2026-11-05'
const job = (o: Partial<DailyJob>): DailyJob => ({
  id: 'j', created_at: '', date: T, staff_name: 'Maria', start_time: '09:00', end_time: '12:00', duty_hours: 3, address: 'Villa 7', area: 'X',
  material: 'No', charges: 0, received: 0, payment_mode: 'Cash', is_overtime: false, remarks: '', ...o,
})
const bk = (o: Partial<Booking>): Booking => ({
  id: 'b', client_id: 'c', client_name: 'Mrs Ali', client_phone: '', service_address: 'Villa 7', service_type: 'Deep Clean', status: 'confirmed',
  frequency: 'once', scheduled_date: T, scheduled_time: '10:00', duration_hours: 3, assigned_crew: ['e1'], total_amount: 0, created_at: '', ...o,
})

// R-ALERT-01: one list, high first
const alerts = buildAlerts({
  notifications: [{ id: 'low-stock', type: 'warning', title: 'Low stock', message: 'Gloves', icon: 'Package', actionUrl: '/inventory' }],
  aiIssues: [{ id: 'd1', type: 'duplicate', severity: 'high', title: 'Duplicate booking', description: 'Same phone twice', entityType: 'booking', entityId: 'b', clientName: 'X', canMoveToPending: true, recommendation: 'Move to Pending' }],
  sheetIssues: [{ kind: 'open', staff: '', text: 'Apt 905 has no cleaner.', job: job({ id: 'o1', staff_name: '' }) }],
  today: T,
  backup: { health: 'failed', message: 'pg_dump' },
  extra: bookingAlerts([bk({ id: 'p1', status: 'pending' }), bk({ id: 'u1', assigned_crew: [] })], T),
})
eq(alerts.map(a => a.source).sort(), ['ai', 'backup', 'bookings', 'bookings', 'sheet', 'system'], 'every source is in the central list')
eq(alerts.slice(0, 3).every(a => a.severity === 'high'), true, 'high priority first')
eq(alerts.find(a => a.source === 'ai')?.opensAIBot, true, 'AI findings open the AI Bot')
eq(alerts.find(a => a.source === 'sheet')?.actionUrl, `/daily-job-sheet?date=${T}`, 'sheet issue opens the day')
eq(buildAlerts({ notifications: [], aiIssues: [], sheetIssues: [], today: T, backup: { health: 'ok' } }).length, 0, 'a good backup gives no alert')
const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
eq(employeeDocAlerts([{ id: 'e1', full_name: 'Maria', status: 'active', visa_expiry: soon } as unknown as Employee]).length, 1, 'visa expiring in 5 days → alert (was the Employees bell)')

// Alerts screen, sidebar, no banners on every screen, no header bells
eq(moduleForPath('/alerts'), 'Alerts', 'Alerts is its own screen')
const layout = src('src/components/layout/Layout.tsx')
eq(/<NotificationCenter/.test(layout) || /AI Bot Alert:/.test(layout), false, 'no ticker / AI banner above every screen')
eq(/label: 'Alerts'/.test(src('src/components/layout/Sidebar.tsx')), true, 'Alerts item in the sidebar')
eq(/notifications=\{/.test(src('src/pages/Bookings.tsx') + src('src/pages/Employees.tsx') + src('src/pages/Agencies.tsx')), false, 'header bells no longer list alerts')
// a permissions save from before Alerts existed still shows it to managers; a newer save is respected
const old = normalizeRolePerms({ manager: ['Overview', 'Clients'] })
eq(old.manager.includes('Alerts'), true, 'old save → new Alerts screen follows its default')
const fresh = normalizeRolePerms({ manager: ['Overview'], _modules: ALL_MODULE_KEYS })
eq(fresh.manager.includes('Alerts'), false, 'admin switched Alerts off after it existed → stays off')

// UX-96: Jobs widget header white; rows white unless a colour was chosen
const djs = src('src/pages/DailyJobSheet.tsx')
eq(/UX-96: white header like the Clients widgets/.test(djs) && !/className="bg-\[#0F1F19\] px-5 py-3\.5/.test(djs), true, 'Jobs header is white')
eq(/pickedCategory\('Monthly'\)/.test(djs) && !/filterColors\.Monthly \|\| '#d1fae5'/.test(djs), true, 'no built-in Monthly tint; white by default')

// UX-97: Clients KPI cards order and filters
const cl = src('src/pages/Clients.tsx')
const order = Array.from(cl.matchAll(/\{ label: '([^']+)',\s+value:/g)).map(m => m[1])
eq(order.slice(0, 6), ['Total Clients', 'Active Clients', 'Monthly Clients', 'New This Month', 'VIP Clients', 'Total Bookings'], 'first row with the swapped cards')
eq(order.slice(6, 12), ['Total Revenue', 'Avg Lifetime', 'Due Balance', 'At-Risk (>60d)', 'Repeat Rate', 'Advance Balance'], 'second row')
eq(/filterType === 'new' \?/.test(cl) && /filterType === 'booked' \?/.test(cl), true, 'New This Month / Total Bookings cards filter')
eq(/\/bookings\?booking=/.test(cl) && /not on sheet/.test(cl), true, 'Recent Bookings opens the booking and flags a missing sheet row')
eq(/searchParams\.get\('booking'\)/.test(src('src/pages/Bookings.tsx')), true, 'Bookings opens ?booking=<id>')

// UX-98: Client Profile
const visits = upcomingVisits(
  [bk({ id: 'old', scheduled_date: '2026-11-01' }), bk({ id: 'next', scheduled_date: '2026-11-08' }), bk({ id: 'done', status: 'completed', scheduled_date: '2026-11-09' })],
  [job({ id: 'sync', date: '2026-11-06', payment_mode: 'Monthly' }), job({ id: 'linked', date: '2026-11-08', booking_id: 'next' })],
  T,
)
eq(visits.map(v => v.key), ['j-sync', 'b-next'], 'upcoming: no past or completed bookings, sheet visits added, no double counting, soonest first')
const sum = jobSheetSummary([job({ date: '2026-11-01', staff_name: 'Maria, Rina' }), job({ date: '2026-11-04', staff_name: 'Maria' }), job({ date: '2026-11-07' })], T)
eq([sum.worked, sum.ahead, sum.cleaners, sum.lastWorked], [2, 1, ['Maria', 'Rina'], '2026-11-04'], 'summary: worked vs ahead, each cleaner once')
const cp = src('src/pages/ClientProfile.tsx')
eq(/Review Requests<\/h3>/.test(cp), false, 'Review Requests widget removed')
eq(/xl:col-span-2 space-y-4/.test(cp), false, 'main content uses the full width')
eq(/sm:absolute sm:top-6 sm:right-7/.test(cp), true, 'Record Payment / Edit Profile inside the header')
