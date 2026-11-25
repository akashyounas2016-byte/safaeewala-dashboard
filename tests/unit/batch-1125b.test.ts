// 2026-11-25 (b): Payments — one date filter, ⋮ menu, cards that can be hidden, one-row toolbar (R-FIN-21)
import { readFileSync } from 'node:fs'
import { resolvePaymentsRange, presetFromParams, inPaymentsRange } from '@/lib/paymentsRange'
import { rangeFigures, monthlyFigures } from '@/lib/businessMetrics'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const T = '2026-11-25'
const r = (p: Parameters<typeof resolvePaymentsRange>[0], f = '', t = '') => { const x = resolvePaymentsRange(p, f, t, T); return [x.start, x.end] }

eq(r('today'), [T, T], 'Today')
eq(r('7days'), ['2026-11-19', T], '7 Days = today and the 6 before')
eq(r('14days'), ['2026-11-12', T], '14 Days')
eq(r('this_month'), ['2026-11-01', T], 'This Month')
eq(r('last_month'), ['2026-10-01', '2026-10-31'], 'Last Month')
eq(r('last_year'), ['2025-01-01', '2025-12-31'], 'Last Year')
eq(r('custom', '2026-11-20', '2026-11-10'), ['2026-11-10', '2026-11-20'], 'Custom: from / to swapped when typed the wrong way')
eq(resolvePaymentsRange('all_time', '', '', T).isAllTime, true, 'All Time')
eq([presetFromParams(null, 'last'), presetFromParams(null, '12'), presetFromParams('14days', 'last'), presetFromParams('x', null)], ['last_month', '12months', '14days', 'this_month'], 'old ?period= links still work; default This Month')
eq([inPaymentsRange(resolvePaymentsRange('7days', '', '', T), '2026-11-18'), inPaymentsRange(resolvePaymentsRange('7days', '', '', T), '2026-11-19T10:00')], [false, true], 'range check by Dubai date')

// rangeFigures = monthlyFigures for a whole month
const input = {
  dailyJobs: [{ id: 'a', date: '2026-10-05', staff_name: 'X', address: 'A', charges: 200, received: 150, payment_mode: 'Cash' }, { id: 'b', date: '2026-11-02', staff_name: 'X', address: 'B', charges: 100, received: 100, payment_mode: 'Online' }] as never[],
  bookings: [], clients: [], dailyExpenses: [], invoices: [],
  monthlyPayments: [{ date: '2026-10-10', amount: 500 }], pendingReceipts: [{ date: '2026-10-20', cash: 30, online: 20 }] as never[],
}
const oct = resolvePaymentsRange('last_month', '', '', T)
const rf = rangeFigures(input as never, d => inPaymentsRange(oct, d))
const mf = monthlyFigures(input as never, [{ key: '2026-10', label: 'Oct 2026', short: 'Oct' }])[0]
eq([rf.collected, rf.contractRevenue, rf.recovered], [mf.collected, mf.contractRevenue, 50], 'a whole month by date = the month figures')

const hub = src('src/pages/PaymentsHub.tsx')
eq(/<PaymentsDateBar /.test(hub) && !/Period:<\/span>/.test(hub), true, 'one date filter under the header (the Period row is gone)')
eq(['Weekly report', 'Export Report', 'Record Manual Pending'].every(l => hub.includes(`label: '${l}'`)) && /aria-label="More actions"/.test(hub), true, 'Weekly report, Export Report, Record Manual Pending in the ⋮ menu')
eq(['filtered_due', 'owing', 'high_value', 'oldest', 'invoices', 'recovery_rate'].every(id => hub.includes(`id: '${id}'`)), true, 'Filtered Due Total and the new cards')
eq(/aria-label=\{`Hide \$\{c\.label\}`\}/.test(hub) && /safeLocalStorageSet\(HIDDEN_CARDS_KEY/.test(hub) && /Show all/.test(hub), true, 'every card can be hidden, remembered, shown again')
const pp = src('src/pages/PendingPayments.tsx')
eq(/\{!embedded && <div className=/.test(pp) && /!embedded && datePreset === 'custom'/.test(pp), true, 'the list\'s own date filter is not shown inside Payments')
eq(!/tracking-wider block">Filtered Due Total/.test(pp) && /aria-label="Sort"/.test(pp) && /xl:flex-nowrap/.test(pp), true, 'toolbar on one row, sort at the end, no total chip')
eq(/if \(embedded && range\) return \{ start: range\.start/.test(pp), true, 'lists follow the Payments date filter')
