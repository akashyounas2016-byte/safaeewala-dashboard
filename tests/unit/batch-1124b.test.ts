// 2026-11-24 (b): staff count with team rows (R-EMP-18), Excel Reconfirmation (R-SHEET-03), Date column (R-SHEET-04)
import { readFileSync } from 'node:fs'
import { countStaffOnJobs } from '@/lib/clientDataSync'
import { buildReconfirmation, reconfirmationText } from '@/lib/excelSheet/reconfirm'
import { buildColumnsWithLetters, DEFAULT_COLUMN_DEFS, EXCEL_DATE_PRESETS, fmtSheetDate } from '@/lib/excelSheet/columns'
import { READ_ONLY_COLS } from '@/lib/excelSheet/sheetConfig'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// R-EMP-18 — 1 Oct: a 6-person team row counted as one person (25 shown, 27 worked)
const team = [
  { staff_name: 'Gyan Bahadur Mahat, Nobel Hasan, Sagar Kumar Chaudhary' },
  { staff_name: 'Ishwor Tamang' },
  { staff_name: 'Ishwor Tamang, Kamala Khatri' },
  { staff_name: 'ishwor  tamang' },
]
eq(countStaffOnJobs(team), 5, 'each cleaner of a team row counts once (Gyan, Nobel, Sagar, Ishwor, Kamala)')
eq(/countStaffOnJobs\(todayJobs\)/.test(readFileSync('src/pages/DailyJobSheet.tsx', 'utf8')), true, 'Daily Job Sheet "Staff on Duty" uses it')

// R-SHEET-03 — the owner's 1 Oct check: 5740 − 5520 − 260 = −40, + 40 advance = 0
const j = (id: string, charges: number, received: number, mode = 'Cash', extra: Partial<DailyJob> = {}) =>
  ({ id, date: '2026-10-01', staff_name: 'A', address: `Site ${id}`, charges, received, payment_mode: mode, ...extra }) as unknown as DailyJob
const rows = [j('1', 5420, 5420), j('2', 60, 100, 'Advance amount'), j('3', 260, 0, 'Pending'), j('blank', 0, 0, '', { address: '' })]
const pend = (r: DailyJob) => Math.max(0, Number(r.charges) - Number(r.received))
const adv = (r: DailyJob) => Math.max(0, Number(r.received) - Number(r.charges))
const r = buildReconfirmation(rows, pend, adv)
eq([r.charges, r.received, r.pending, r.balance, r.advance, r.finalBalance, r.rows, r.gaps.length], [5740, 5520, 260, -40, 40, 0, 3, 0], 'Charges, Less Rcvd, Pending, Balance, Add Adv, Balance = 0')
const off = buildReconfirmation([j('4', 100, 0, 'Pending')], () => 0, adv) // pending already covered somewhere else
eq([off.finalBalance, off.gaps.map(g => [g.job.id, g.gap])], [100, [['4', 100]]], 'a row that does not add up is listed with the amount')
eq(reconfirmationText(r, '01 Oct').split('\n').slice(-1)[0], 'Balance: 0 ✓', 'copy text ends with the balance')
const xl = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/<Check size=\{13\} \/> Reconfirmation/.test(xl) && /<ReconfirmationModal/.test(xl), true, 'Reconfirmation button in the footer opens the pop-up')

// R-SHEET-04
const order = DEFAULT_COLUMN_DEFS.map(c => c.id as string)
eq(buildColumnsWithLetters(order, [], false).some(c => c.id === 'date'), false, 'one day open: no Date column')
const ranged = buildColumnsWithLetters(order, [], true).map(c => c.id)
eq(ranged.indexOf('date') === ranged.indexOf('start_time') - 1, true, 'more days open: Date right before Start time')
eq(buildColumnsWithLetters(order, ['start_time'], true).map(c => c.id).includes('date'), true, 'Date shows even when Start time is hidden')
eq(READ_ONLY_COLS.has('date'), true, 'Date column cannot be typed into')
eq(['last_7_days', 'last_30_days'].every(id => EXCEL_DATE_PRESETS.some(p => p.id === id)), true, 'Last 7 Days and Last 30 Days presets')
eq(/showDateCol = !oneDayOpen/.test(xl), true, 'Date column follows the open dates')
eq(fmtSheetDate('2026-10-01'), new Date('2026-10-01T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }), 'short date in the cell')
