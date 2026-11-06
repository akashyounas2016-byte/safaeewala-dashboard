// Round 2026-11-06 (b): shared business figures, Payments hub (Pending merged), Settings truth, one header colour
// (R-FIN-07, R-FIN-08, UX-106, UX-107)
import { readFileSync } from 'node:fs'
import { monthlyFigures, lastMonths, insightsFor, outstandingNow } from '@/lib/businessMetrics'
import { hubTabOf } from '@/pages/PaymentsHub'
import { canAccessModule, moduleForPath, DEFAULT_ROLE_PERMS } from '@/lib/permissions'
import type { Booking, DailyJob, Invoice } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const job = (o: Partial<DailyJob>) => ({ id: 'j', date: '2026-11-03', staff_name: 'Maria', start_time: '09:00', end_time: '12:00', duty_hours: 3, address: 'Villa 7', area: 'Barsha', charges: 200, received: 150, payment_mode: 'Cash', ...o }) as DailyJob

// R-FIN-07: monthly contracts, unlinked bookings and recoveries are counted once
const months = lastMonths(2, '2026-11-06')
eq(months.map(m => m.key), ['2026-10', '2026-11'], 'last months in Dubai order')
const [, nov] = monthlyFigures({
  dailyJobs: [job({}), job({ id: 'm', payment_mode: 'Monthly', charges: 0, received: 0, booking_id: 'b1' })],
  bookings: [{ id: 'b1', status: 'completed', scheduled_date: '2026-11-04', total_amount: 300 } as Booking, { id: 'b2', status: 'completed', scheduled_date: '2026-11-05', total_amount: 100, received_amount: 100 } as Booking],
  clients: [], dailyExpenses: [{ id: 'e', date: '2026-11-02', amount: 50 } as never], invoices: [],
  monthlyPayments: [{ amount: 1000, date: '2026-11-01' }],
  pendingReceipts: [{ id: 'r', date: '2026-11-05', client: 'X', cash: 50, online: 0 }],
}, months)
eq([nov.oneOffRevenue, nov.contractRevenue, nov.revenue], [300, 1000, 1300], 'revenue = job charges + unlinked booking + monthly contract payments (linked booking not counted twice)')
eq(nov.collected, 150 + 100 + 50 + 1000, 'collected = received + unlinked booking received + recoveries + contracts')
eq([nov.expenses, nov.profit, nov.jobs], [50, 1250, 3], 'gross profit and jobs')
eq(outstandingNow({ dailyJobs: [], invoices: [{ id: 'i', status: 'sent', total: 500, amount_paid: 200 } as Invoice, { id: 'v', status: 'void', total: 900 } as Invoice], pendingReceipts: [] }).invoices, 300, 'outstanding invoices count the unpaid part, not void')
const ins = insightsFor({ dailyJobs: [job({}), job({ id: 'k', date: '2026-11-04', staff_name: 'Maria, Rina', charges: 100, duty_hours: 2 })] }, ['2026-10', '2026-11'])
eq([ins.busiestDay?.jobs, ins.staff.find(s => s.name === 'Rina')?.revenue, ins.revenuePerHour], [1, 50, 60], 'insights: weekday, shared job split, AED per hour')
eq(/monthlyFigures\(/.test(src('src/pages/Reports.tsx')) && /monthlyFigures\(/.test(src('src/pages/BusinessAnalytics.tsx')), true, 'Reports and Analytics use the same figures')
eq(/i\.status === 'sent' \|\| i\.status === 'overdue'\)\s*\.reduce\(\(s, i\) => s \+ i\.total/.test(src('src/pages/Reports.tsx')), false, 'Reports no longer counts paid parts of invoices as pending')

// R-FIN-08: Pending inside Payments
eq([hubTabOf(null), hubTabOf('pending'), hubTabOf('cash_book'), hubTabOf('x')], ['outstanding', 'outstanding', 'cash_book', 'outstanding'], 'hub tabs, old links mapped')
eq(moduleForPath('/pending'), 'Payments', '/pending belongs to Payments')
const perms = { ...DEFAULT_ROLE_PERMS, employee: ['Pending'] } as typeof DEFAULT_ROLE_PERMS
eq(canAccessModule('employee', perms, 'Payments'), true, 'a role allowed Pending still reaches it inside Payments')
eq(/to: '\/pending'/.test(src('src/components/layout/Sidebar.tsx')), false, 'no Pending item in the sidebar')
eq(/<Route path="pending"\s+element=\{<PendingRedirect \/>\}/.test(src('src/App.tsx')), true, '/pending redirects')

// Settings truth + header colour
const st = src('src/pages/Settings.tsx')
eq(/'Not enabled'|value: 'Today'|value: 'Owner'/.test(st), false, 'no made-up 2FA / last login / owner values')
eq(/Nothing is sent yet/.test(st), true, 'Notifications say nothing is sent')
eq(/\.gradient-card \{\s*background: #0F1F19;/.test(src('src/index.css')), true, 'every PageHero uses the Daily Job Sheet header colour')
