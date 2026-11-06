// Round 2026-11-06: collected = received, Jobs Show/Hide, Excel auto-save, Repeat tag, 5 cards a row, Employees cards (R-FIN-03, R-SYNC-14, UX-99..102)
import { readFileSync } from 'node:fs'
import { jobCollected } from '@/lib/clientDataSync'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const job = (o: Partial<DailyJob>) => ({ id: 'j', date: '2026-11-06', staff_name: 'Nim Kumari', charges: 1000, received: 0, payment_mode: 'Cash', ...o }) as DailyJob

// R-FIN-03: the screenshot case — Cash, 1000 charged, nothing received → pending, not in Driver Payment Received
eq(jobCollected(job({})), 0, 'cash job with nothing received is not collected')
eq(jobCollected(job({ received: 600 })), 600, 'received counts')
const djs = src('src/pages/DailyJobSheet.tsx')
eq(/Object\.entries\(summary\)\.filter\(\(\[, amt\]\) => amt > 0\)/.test(djs), true, 'driver list skips staff with nothing collected')

// UX-99: Jobs Show / Hide
eq(/\{!jobsCollapsed && \(<>/.test(djs) && /onClick=\{toggleJobs\}/.test(djs), true, 'Jobs section has a Show / Hide toggle')

// R-SYNC-14: Excel auto-save 3 s after the last change; auto mode never asks
const xl = src('src/pages/JobSheetSpreadsheet.tsx')
eq(/saveRef\.current\('auto'\)\s*\}, 3000\)/.test(xl), true, 'auto-save after 3 seconds')
eq(/if \(!hasUnsavedChanges \|\| editingCell \|\| showAddJobModal\) return/.test(xl), true, 'not while typing in a cell or in the Add Job form')
eq(/if \(auto\) \{ setAutoSaveBlocked/.test(xl), true, 'a clash / remote change stops auto-save with a note instead of a question')
eq(/onClick=\{handleSaveAll\}/.test(xl), false, 'Save button does not pass the click event as the mode')

// UX-100
eq(/totalServices >= 2 && !isClientMonthly/.test(src('src/pages/ClientProfile.tsx')), true, 'no Repeat Client tag on a Monthly client')

// UX-101: 5 + 5 cards, At-Risk and Repeat Rate gone, titles wrap
const cl = src('src/pages/Clients.tsx')
const order = Array.from(cl.matchAll(/\{ label: '([^']+)',\s+value:/g)).map(m => m[1])
eq(order.slice(0, 10), ['Total Clients', 'Active Clients', 'Monthly Clients', 'New This Month', 'VIP Clients', 'Total Bookings', 'Total Revenue', 'Avg Lifetime', 'Due Balance', 'Advance Balance'], 'two rows of 5')
eq((cl.match(/xl:grid-cols-5 gap-3\.5/g) || []).length, 2, '5 a row')
eq(/line-clamp-2/.test(cl) && /line-clamp-2/.test(src('src/components/dailyJobSheet/JobSheetKPIs.tsx')), true, 'long titles wrap on Clients and Daily Job Sheet cards')

// UX-102: Employees
const em = src('src/pages/Employees.tsx')
eq(['Agency Staff', 'Available Staff', 'Absentees', 'On Leave'].every(l => em.includes(`label="${l}"`)), true, 'four new cards (KpiCard since UX-109)')
eq(/More staff metrics \(5\)/.test(em), true, 'behind an expand arrow (5 since UX-109)')
eq(/Daily Sheet Synced/.test(em), false, '"Daily Sheet Synced" text removed')
eq(/title="Synced with the Daily Job Sheet"/.test(em), true, 'icon beside the status instead')
eq(/STAFF_CARD_LIMIT = 6/.test(em) && /View All \(\{filtered\.length\}\)/.test(em), true, '3 rows of cards, then View All')

// UX-104: Bookings cards in the Daily Job Sheet style, 5 a row, Avg Shift Duty / Staff Allocated removed
const bk = src('src/pages/Bookings.tsx')
const bkKpi = bk.slice(bk.indexOf('UX-104'), bk.indexOf('const renderKpi'))
const bkOrder = Array.from(bkKpi.matchAll(/\{ label: '([^']+)', value:/g)).map(m => m[1])
eq(bkOrder, ['Total Bookings', 'Scheduled', 'Live Now', 'Pending', 'Completed', 'Monthly Clients', 'Total Workload', 'Billed Revenue', 'Cleaners on Duty', 'Uncollected Dues'], 'Bookings: two rows of 5')
eq(/label: '(Avg Shift Duty|Staff Allocated)'/.test(bk), false, 'Avg Shift Duty and Staff Allocated removed')
eq((bk.match(/xl:grid-cols-5 gap-3\.5/g) || []).length, 2, 'Bookings: 5 a row')
eq(/line-clamp-2/.test(bk) && /iconSolid/.test(bk), true, 'Bookings cards use the Daily Job Sheet style')
