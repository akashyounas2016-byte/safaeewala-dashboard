// R-FIN-12..15, R-SCHED-26, R-SCHED-27, R-BK-06, R-ALERT-05, R-DATA-14 (2026-11-21/22)
import { readFileSync } from 'node:fs'
import { unallocatedReceipts, monthlyVisitRemark, isAdHocJob } from '@/lib/clientDataSync'
import { recalcInvoiceTotals } from '@/lib/receivables'
import { contractEndAlerts } from '@/lib/alerts'
import type { Client, DailyPendingReceivedItem, RecurringContract } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const villa = { id: 'v1', full_name: 'Villa 87b St 63d' } as Client
const r = (x: Partial<DailyPendingReceivedItem>) => ({ id: 'r', date: '2026-10-01', client: 'Villa 87b St 63d', cash: 0, online: 0, ...x }) as DailyPendingReceivedItem
eq(unallocatedReceipts(villa, [r({ cash: 540, client_id: 'v1', allocations: [], opening_applied: 0 })]), 540, 'money collected with nothing pending is advance (R-FIN-12)')
eq(unallocatedReceipts(villa, [r({ cash: 300, client_id: 'v1', allocations: [{ job_id: 'j', amount: 200 }] })]), 100, 'only the part not used on dues')
eq(unallocatedReceipts(villa, [r({ cash: 300, client_id: 'v1', job_id: 'j' })]), 0, 'a collection against one job is not advance')

eq(monthlyVisitRemark({ remarks: 'Sofa Cleaning' }), 'Sofa Cleaning (Monthly Schedule)', 'visit remark from the client (R-SCHED-26)')
eq(monthlyVisitRemark({ remarks: '' }), '(Monthly Schedule)', 'no remarks')
eq([isAdHocJob({ remarks: 'Ad-hoc · deep clean' }), isAdHocJob({ remarks: 'Monthly Contract' })], [true, false], 'Ad-hoc jobs are recognised (R-BK-06)')

eq(recalcInvoiceTotals({ line_items: [{ description: 'a', quantity: 3, unit_price: 30, amount: 90 }, { description: 'b', quantity: 3, unit_price: 30, amount: 90 }], vat_rate: 5 } as never), { subtotal: 180, discount_amount: 0, vat_amount: 9, total: 189 }, 'invoice totals after a line change (R-FIN-14)')

const c = (end: string) => ({ id: 'c', full_name: 'Client X', service_mode: 'monthly', service_days: ['Monday'] }) as unknown as Client
const k = (end: string) => [{ id: 'k', clientName: 'Client X', status: 'active', startDate: '2026-01-01', endDate: end }] as unknown as RecurringContract[]
eq(contractEndAlerts([c('')], k('2026-11-25'), '2026-11-22').map(a => a.severity), ['high'], 'contract ending in 3 days → high alert (R-ALERT-05)')
eq(contractEndAlerts([c('')], k('2026-12-15'), '2026-11-22').map(a => a.severity), ['medium'], 'in 23 days → medium')
eq(contractEndAlerts([c('')], k('2027-03-01'), '2026-11-22').length, 0, 'far away → no alert')

const sync = readFileSync('src/lib/syncQueue.ts', 'utf8')
eq(/'client_id', \/\/ R-DATA-12 \/ R-DATA-14/.test(sync), true, 'client_id reaches the database (R-DATA-14)')
const shell = readFileSync('src/components/monthlyClients/WeeklyScheduleCard.tsx', 'utf8')
eq(/6\. Material/.test(shell) && /7\. Charges \/ Hr/.test(shell), true, 'weekly schedule has Material and Charges / Hr (R-SCHED-27)')
const bi = readFileSync('src/components/clients/BiWeeklyScheduleCard.tsx', 'utf8')
eq(/Total Charges/.test(bi), true, 'bi-weekly schedule has Total Charges')
const mc = readFileSync('src/pages/MonthlyClients.tsx', 'utf8')
eq(/Price per Hour/.test(mc) && /Leave this job out of the invoice/.test(mc), true, 'invoice preview: Sr#/Date/Day/Duty Hours/Price per Hour/Charges with actions (R-FIN-13, names R-FIN-26)')
