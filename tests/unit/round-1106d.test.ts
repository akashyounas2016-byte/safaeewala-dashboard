// Round 2026-11-06 (d): payment history shows booking payments and can delete; Monthly Clients wide view;
// Expenses cards + Profit & Loss widget, collections counted like Payments (R-FIN-09, UX-110, UX-111)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

const pp = src('src/pages/PaymentProcessing.tsx')
eq(/bookingsWithoutRow\(bookings, dailyJobs\)\.forEach/.test(pp) && /type: 'Booking'/.test(pp), true, 'booking payments (no job row) are listed — the AED 590 was not')
eq(/const handleDeleteHistory = async/.test(pp) && /onClick=\{\(\) => \{ void handleDeleteHistory\(item\) \}\}/.test(pp), true, 'every history row has Delete')
eq(/confirmAsync\(\{ title: 'Delete payment', message: `Delete AED/.test(pp), true, 'Delete asks first and says what happens')
eq(/updateDailyJob\(record\.id\.replace\(\/\^dj-rec-\/, ''\), \{ received: 0 \}\)/.test(pp), true, 'a job payment is cleared, the job stays')

const mc = src('src/pages/MonthlyClients.tsx')
eq(/useState<'grid' \| 'table' \| 'wide'>/.test(mc) && /setViewMode\('wide'\)/.test(mc), true, 'Monthly Clients has a wide view')
eq(/xl:grid-cols-3 2xl:grid-cols-4/.test(mc) && /wide \? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start' : 'space-y-5'/.test(mc), true, 'wide view: 3–4 cards a row, widgets at the bottom')

const ex = src('src/pages/Expenses.tsx')
eq((ex.match(/<KpiCard /g) || []).length, 6, 'Expenses: six Daily Job Sheet style cards')
eq(/<Widget title="Profit & Loss"/.test(ex) && !/>Expense Ratio</.test(ex), true, 'Expense Ratio card moved into a Profit & Loss widget')
eq(/Number\(b\.received_amount\) \|\| 0\), 0\) \/\/ R-FIN-07/.test(ex), true, 'collections count received on bookings, like Payments')

// Delivery check: no invented marketing figures (R-DATA-03)
const mk = src('src/pages/MarketingDashboard.tsx')
eq(/retentionMetrics|Summer Promotion|87%|churn/i.test(mk), false, 'Marketing shows no made-up campaign / retention numbers')
eq(/Marketing is not connected yet/.test(mk), true, 'Marketing says it is not connected')
