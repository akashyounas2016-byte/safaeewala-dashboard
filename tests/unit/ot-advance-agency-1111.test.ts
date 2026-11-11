// 2026-11-11: OT by Total Duty Hours (R-OT-03), white dropdowns (UX-133), green active cell + Charges (hrs) (UX-134),
// client advance / pending in Add Job (UX-135) + auto advance deduction (R-FIN-10), single-date selector (UX-136),
// copy / paste rows (UX-137), monthly replacement (R-SCHED-09), Third Party (Group) trade licenses (R-AGN-07)
import { readFileSync, readdirSync } from 'node:fs'
import { recalculateAllRowsOT, setCleanerBasicHours, basicHoursFor, calcOTHours } from '@/components/dailyJobSheet/jobSheetUtils'
import { DEFAULT_COLUMN_DEFS, chargesPerHour } from '@/lib/excelSheet/columns'
import { READ_ONLY_COLS } from '@/lib/excelSheet/sheetConfig'
import { calcClientAdvanceBalance, autoAdvanceRemark, PAID_FROM_ADVANCE_NOTE } from '@/lib/clientAdvance'
import { isJobPaidFromAdvance, calcJobPending } from '@/lib/clientDataSync'
import { monthlyJobsNeedingCover, replaceCleanerOnRow, isFreeFor, pasteRowInto } from '@/lib/excelSheet/replacement'
import { tradeLicenseProblems, filledLicenses } from '@/components/agencies/TradeLicensesModal'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const job = (id: string, staff: string, s: string, e: string, extra: Record<string, unknown> = {}) =>
  ({ id, date: '2026-11-11', staff_name: staff, start_time: s, end_time: e, address: 'Marina Tower', charges: 0, received: 0, ...extra }) as unknown as DailyJob

// ── R-OT-03: OT after the employee's own Total Duty Hours (or after 8 PM) ──
setCleanerBasicHours([{ full_name: 'Uma Devi', short_name: 'Uma', total_duty_hours: 10 }, { full_name: 'Misbah', total_duty_hours: 8 }, { full_name: 'Ambika' }])
eq([basicHoursFor('uma'), basicHoursFor('Uma Devi'), basicHoursFor('Ambika'), basicHoursFor('nobody')], [10, 10, 8, 8], 'basic hours from the employee; blank / unknown → 8')
const ot = (staff: string, s: string, e: string) => recalculateAllRowsOT([job('x', staff, s, e)])[0].ot_hours
eq(ot('Uma', '08:00 AM', '06:00 PM'), 0, '10 h employee: 10 h before 8 PM → no OT')
eq(ot('Misbah', '08:00 AM', '06:00 PM'), 2, '8 h employee: same 10 h → 2 h OT')
eq(ot('Uma', '07:00 AM', '07:00 PM'), 2, '10 h employee: 12 h → 2 h OT')
eq(ot('Uma', '02:00 PM', '10:00 PM'), 2, 'after 8 PM is always OT, even under the basic hours')
eq(calcOTHours('08:00 AM', '06:00 PM', 10), 0, 'single-shift helper takes the basic hours too')
const readme = readFileSync('README.md', 'utf8')
eq(/R-OT-03/.test(readme) && /Total Duty Hours/.test(readme), true, 'OT rule written in README.md')
eq(/R-OT-03/.test(readFileSync('rules.md', 'utf8')), true, 'OT rule in rules.md')
eq(/setCleanerBasicHours\(employees\)/.test(readFileSync('src/store/DataContext.tsx', 'utf8')), true, 'every screen gets the employee hours before OT is worked out')
setCleanerBasicHours([])

// ── UX-133: white searchable dropdowns in Add Employee ──
const form = readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')
eq(/<select\b/.test(form), false, 'no native (black) dropdowns left in the employee popup')
eq(/name="nationality"[\s\S]{0,400}allowCustom/.test(form), true, 'Nationality: pick from the list or type a new one')
eq(/id="assigned_client_id"/.test(form) && /<SearchSelect/.test(form), true, 'Client uses the same dropdown')

// ── UX-134: green active cell, Charges (hrs) ──
const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/\.xl-active\{outline:2px solid #16a34a/.test(page) && (page.match(/'xl-active /g) || []).length >= 3, true, 'keyboard cell has a green border in grid, block and staff cells')
const ids = DEFAULT_COLUMN_DEFS.map(c => c.id)
eq(ids.indexOf('charges_per_hour'), ids.indexOf('charges') + 1, 'Charges (hrs) right after Charges')
eq([chargesPerHour({ charges_per_hour: 45 }), chargesPerHour({}), chargesPerHour({ charges_per_hour: 'x' })], [45, 0, 0], 'UX-138: Charges (hrs) is the typed value, not worked out')
eq(READ_ONLY_COLS.has('charges_per_hour'), false, 'UX-138: Charges (hrs) can be typed')

// ── R-FIN-10: advance balance + automatic deduction ──
const client = { id: 'c1', full_name: 'Marina Tower', area: 'Marina', phone: '', city: 'Dubai', advance_amount: 500 } as unknown as Client
const paid = job('p1', 'Uma', '09:00 AM', '01:00 PM', { charges: 200, remarks: PAID_FROM_ADVANCE_NOTE })
const over = job('p2', 'Uma', '09:00 AM', '01:00 PM', { date: '2026-11-01', charges: 100, received: 150 })
eq(calcClientAdvanceBalance(client, [paid, over], [], []), 350, 'balance = 500 opening + 50 overpaid − 200 used')
eq([isJobPaidFromAdvance(paid), calcJobPending(paid)], [true, 0], 'a job paid from advance is not pending — nothing to collect')
eq(autoAdvanceRemark({ charges: 300, received: 0, payment_mode: 'Cash', remarks: 'Key at reception' }, 350), `Key at reception · ${PAID_FROM_ADVANCE_NOTE}`, 'advance covers the job → paid from advance')
eq([
  autoAdvanceRemark({ charges: 400, received: 0, payment_mode: 'Cash', remarks: '' }, 350),
  autoAdvanceRemark({ charges: 100, received: 100, payment_mode: 'Cash', remarks: '' }, 350),
  autoAdvanceRemark({ charges: 100, received: 0, payment_mode: 'Monthly', remarks: '' }, 350),
], [null, null, null], 'not enough advance / already paid / monthly contract → unchanged')
const addJob = readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')
eq(/autoAdvanceRemark\(/.test(addJob) && /!initial\?\.id && pickedClient/.test(addJob), true, 'Add Job applies it to new jobs of a picked client')
eq(/<MoneyChip status=\{listStatus\.get\(item\.key\)\}/.test(addJob) && /Advance AED/.test(addJob), true, 'client list and picked client show advance / pending (UX-135)')
eq(/sm:min-w-\[460px\]/.test(readFileSync('src/components/common/CleanerMultiSelect.tsx', 'utf8')), true, 'staff picker is wider')

// ── UX-136: one date unless Custom Range ──
eq(/setActiveDatePreset\('single'\)/.test(page) && !/else setActiveDatePreset\('custom'\)/.test(page), true, 'picking one date keeps the single date box (no From–To)')

// ── UX-137: copy / paste rows ──
const src = job('s', 'Uma', '09:00 AM', '01:00 PM', { address: 'Palm Villa', charges: 250, received: 250, row_color: 'c02', remarks: 'bring ladder' })
const tgt = job('t', 'Misbah', '', '', { address: '', date: '2026-11-12' })
const pasted = pasteRowInto(tgt, src)
eq([pasted.id, pasted.date, pasted.staff_name, pasted.address, pasted.charges, pasted.received, pasted.row_color, pasted.remarks], ['t', '2026-11-12', 'Misbah', 'Palm Villa', 250, 0, undefined, 'bring ladder'], 'paste: job details copied; row keeps id, date, cleaner; no money received or row colour')
eq(pasteRowInto(job('e', '', '', ''), src).staff_name, 'Uma', 'empty row takes the copied cleaner')
eq(/handleCopyRow\(contextMenu\.rowIdx\)/.test(page) && /handlePasteRow\(contextMenu\.rowIdx\)/.test(page) && /if \(e\.altKey\)/.test(page), true, 'right-click Copy / Paste and Alt + drag')

// ── R-SCHED-09: replacement for a monthly client ──
const rows = [
  job('m1', 'Uma', '09:00 AM', '01:00 PM', { address: 'Palm Villa', payment_mode: 'Monthly' }),
  job('m2', 'Uma, Misbah', '02:00 PM', '04:00 PM', { address: 'Palm Villa', payment_mode: 'Cash' }),
  job('o1', 'Uma', '05:00 PM', '07:00 PM', { address: 'abc tesing', payment_mode: 'Monthly' }),
  job('b1', 'Ambika', '10:00 AM', '12:00 PM', { payment_mode: 'Cash' }),
]
const contractClients = [{ id: 'pv', full_name: 'Palm Villa', area: '', phone: '', city: 'Dubai', service_days: ['Monday'] }, { id: 'abc', full_name: 'abc tesing', area: '', phone: '', city: 'Dubai' }] as unknown as Client[]
const needs = monthlyJobsNeedingCover(rows, '2026-11-11', new Set(['uma']), contractClients)
eq(needs.map(n => [n.cleaner, n.rows.map(r => r.id)]), [['Uma', ['m1', 'm2']]], 'only jobs of a real monthly-contract client (UX-141: Mode "Monthly" alone does not count)')
eq([replaceCleanerOnRow(rows[1], 'Uma', 'Ambika').staff_name, replaceCleanerOnRow(rows[1], 'Uma', 'Misbah').staff_name], ['Ambika, Misbah', 'Misbah'], 'swap keeps the team, no duplicates')
eq([isFreeFor(rows, 'Ambika', needs[0].rows), isFreeFor(rows, 'Zara', needs[0].rows)], [false, true], 'busy / free check against the other jobs')
eq(/handleReplaceCleaner/.test(page) && /monthly schedule is not changed/.test(page), true, 'banner changes that date only (R-SCHED-01)')

// ── R-AGN-07: Third Party (Group) trade licenses ──
eq(tradeLicenseProblems([{ id: '1', name: 'Main', issue_date: '2026-05-01', expiry_date: '2026-01-01' }]), ['Main: issue date is after the expiry date'], 'issue after expiry refused')
eq(filledLicenses([{ id: '1' }, { id: '2', name: 'Branch' }]).map(l => l.id), ['2'], 'empty rows dropped')
const ag = readFileSync('src/pages/Agencies.tsx', 'utf8')
eq((ag.match(/<option value="Third Party \(Group\)">/g) || []).length, 2, 'Third Party (Group) in Add and Edit')
eq((ag.match(/=== 'Third Party \(Group\)' && \(\s*<button/g) || []).length, 2, 'New button only for Third Party (Group)')
const sql = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
eq(/alter table public\.agencies add column if not exists trade_licenses jsonb/.test(sql), true, 'column for the license list')
