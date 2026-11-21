// R-PAY-07, R-OPS-10, UX-191..196 (2026-11-21, second list)
import { readFileSync } from 'node:fs'
import { amountInMode, hasMode, cleanModeSplit, splitModeLabel } from '@/lib/paymentSplit'
import { restoreKindOf } from '@/lib/auditLog'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const split = { payment_mode: 'Cash + Online', received: 300, mode_split: [{ mode: 'Cash', amount: 100 }, { mode: 'Online', amount: 200 }] } as unknown as DailyJob
eq([amountInMode(split, 'Cash'), amountInMode(split, 'Online')], [100, 200], 'a split job counts each part in its own mode (R-PAY-07)')
eq(amountInMode({ payment_mode: 'Cash', received: 250 } as DailyJob, 'Cash'), 250, 'a one-mode job is unchanged')
eq([hasMode(split, 'cash'), hasMode(split, 'Monthly')], [true, false], 'Cash / Online filters find split jobs')
eq(splitModeLabel(cleanModeSplit([{ mode: 'Cash', amount: 50 }, { mode: 'cash', amount: 25 }, { mode: 'Online', amount: 10 }])), 'Cash + Online', 'repeated modes are joined')

const e = (action: string, entity: string, snapshot: unknown = null) => ({ action, entity, entity_id: 'x1', snapshot }) as never
eq(restoreKindOf(e('deleted', 'daily_job', { id: 'x1', staff_name: 'A' })), 'readd', 'a deleted job with its snapshot comes back (R-OPS-10)')
eq(restoreKindOf(e('updated', 'client', { before: { phone: '050' } })), 'revert', 'a change can be put back')
eq(restoreKindOf(e('created', 'daily_job')), 'remove', 'an added job can be removed')
eq(restoreKindOf(e('deleted', 'client')), null, 'old entries without a snapshot cannot be restored')
eq(restoreKindOf(e('deleted', 'invoice', { id: 'x1' })), null, 'only jobs, clients, employees, expenses')

const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/onMouseDown=\{e => \{ e\.preventDefault\(\); e\.stopPropagation\(\); void removeListItem/.test(sheet), true, 'Mode / Material delete works on mouse-down and asks first (UX-191)')
eq(/Sum: <strong/.test(sheet), true, 'footer shows the Sum of the chosen cells (UX-193)')
eq(/UX-194[\s\S]{0,200}_isSecondaryCleaner/.test(sheet), true, 'team remarks only on the leader (UX-194)')
const add = readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')
eq(/useClientMoney\(/.test(add), true, 'Add Job address list balances load in steps (UX-196)')
const emp = readFileSync('src/pages/Employees.tsx', 'utf8')
eq(/typeToConfirm: 'DELETE'/.test(emp), true, 'deleting an employee needs DELETE typed (UX-195)')
