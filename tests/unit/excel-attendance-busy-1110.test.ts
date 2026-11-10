// 2026-11-10: Busy till <time> (UX-131), Excel OT once per cleaner (UX-131), Attendance column (R-ATT-10),
// row colour uniqueness (R-SHEET-01), arrow keys / drag selection (UX-132), Add Employee fields (R-EMP-11, R-DOC-03)
import { readFileSync, readdirSync } from 'node:fs'
import { busyCleaners, busyLabel } from '@/lib/staffBusy'
import { rowColorConflict } from '@/lib/excelSheet/sheetConfig'
import { DEFAULT_COLUMN_DEFS } from '@/lib/excelSheet/columns'
import { attendanceKeyFor, isAwayMark, awayCleanerNames, newAbsenceMark } from '@/lib/attendance'
import { attendanceLabel } from '@/components/dailyJobSheet/ExcelAttendanceCell'
import { deleteVersion } from '@/lib/docVersions'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// ── Busy till ──
const job = (id: string, staff: string, s: string, e: string, extra: Record<string, unknown> = {}) =>
  ({ id, date: '2026-11-10', staff_name: staff, start_time: s, end_time: e, address: '', ...extra }) as unknown as DailyJob
const jobs = [job('a', 'Uma', '09:00 AM', '01:00 PM'), job('b', 'Uma', '05:00 PM', '09:00 PM'), job('c', 'Misbah', '10:00 AM', '', { duty_hours: 4 }), job('d', 'Ambika', '10:00 AM', '06:00 PM', { booking_id: 'bk1' })]
const at = (opts = {}) => busyCleaners(jobs, '2026-11-10', { today: '2026-11-10', nowMin: 8 * 60, ...opts })
eq(busyLabel(at().get('uma')), 'Busy till 9:00 PM', 'two shifts → busy till the later end')
eq(busyLabel(at().get('misbah')), 'Busy till 2:00 PM', 'no end time → start + duty hours')
eq(busyLabel(undefined), 'Busy', 'no end known → plain Busy')
eq(at({ isDone: (id: string, n: string) => id === 'b' && n === 'uma' }).get('uma')?.until, '1:00 PM', 'evening job ended in My Duties → busy only till the first job ends')
eq(at({ isDone: (_: string, __: string, j: { booking_id?: string }) => j.booking_id === 'bk1' }).has('ambika'), false, 'booking completed → not Busy')
eq(busyCleaners(jobs, '2026-11-10', { today: '2026-11-10', nowMin: 21 * 60 + 5 }).size, 0, 'after 9:05 PM nobody is Busy any more')
const ms = readFileSync('src/components/common/CleanerMultiSelect.tsx', 'utf8')
eq(/busyLabel\(busyItem/.test(ms), true, 'the picker shows "Busy till …"')
eq(['src/components/dailyJobSheet/AddJobModal.tsx', 'src/components/bookings/NewBookingModal.tsx'].every(f => { const s = readFileSync(f, 'utf8'); return /useDubaiMinute\(\)/.test(s) && /useJobCheckins\(/.test(s) && /isDone/.test(s) }), true, 'Add Job (Excel + Daily Job Sheet) and Booking pickers re-check every minute and after End')

// ── Attendance column ──
const ids = DEFAULT_COLUMN_DEFS.map(c => c.id)
eq(ids.indexOf('attendance') === ids.indexOf('payment_mode') + 1 && ids.indexOf('remarks') === ids.indexOf('attendance') + 1, true, 'Attendance sits between Mode and Remarks')
eq([attendanceLabel(undefined, true), attendanceLabel(undefined, false)], ['Present', 'Available'], 'with a job → Present; no job → Available (never absent by default, R-ATT-01)')
const leave = newAbsenceMark('Short Leave', 'doctor', 'admin', 'Owner')
eq([attendanceLabel(leave, true), attendanceLabel(newAbsenceMark('Short Leave', 'x', 'staff', 'A'), true), attendanceLabel(newAbsenceMark('Uninformed Absence', '', 'admin', 'O'), true)], ['Short Leave', 'Short Leave (pending)', 'Absent'], 'labels for leave / pending / absent')
eq([isAwayMark(leave), isAwayMark({ status: 'on_leave', category: 'Sick Leave', updatedAt: '' })], [false, true], 'short leave still works that day — not removed from assign lists')
eq(awayCleanerNames({ '2026-11-10_uma': leave }, [], '2026-11-10').size, 0, 'short leave is not "away"')
eq(attendanceKeyFor('2026-11-10', 'Uma ', [{ id: 'e1', full_name: 'uma' }]), { key: '2026-11-10_id:e1', nameKey: '2026-11-10_uma' }, 'saved under the employee id like the Attendance screen')
const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq((page.match(/col\.id === 'attendance' \?/g) || []).length, 2, 'Attendance dropdown in grid and Block mode')

// ── OT on the last row only ──
eq(/blockOTByLastRow\.get\(row\.id\)/.test(page) && /isLastJob && group\.totalOT/.test(page), true, 'OT = the cleaner total, on the last row of the block')

// ── 90 % zoom fills the screen ──
eq(/width: `\$\{10000 \/ zoomLevel\}vw`/.test(page) && /height: `\$\{10000 \/ zoomLevel\}vh`/.test(page), true, 'zoom grows the box by 100/zoom → no empty strip')

// ── Row colour uniqueness ──
const r = (id: string, color: string, extra: Record<string, unknown> = {}) => ({ id, date: '2026-11-10', staff_name: id, row_color: color, address: '', ...extra }) as unknown as DailyJob
const rows = [r('x', 'c02'), r('y', ''), r('t1', 'c03'), r('t2', 'c03'), r('z', 'c02', { date: '2026-11-11' })]
const team = (row: DailyJob) => (row.id.startsWith('t') ? 'team-1' : null)
eq(rowColorConflict(rows, ['y'], 'c02', team)?.id, 'x', 'a colour on another row is refused')
eq(rowColorConflict(rows, ['t1'], 'c03', team), null, 'a team shares its colour')
eq(rowColorConflict(rows, ['y'], 'white', team), null, 'white / default are always free')
eq(rowColorConflict([rows[4], r('w', '')], ['w'], 'c02', team), null, 'another date does not count')
eq(/refuseUsedColor\(blockIds, paletteKey\)/.test(page) && /refuseUsedColor\(\[updated\[rowIdx\]\.id\], paletteKey\)/.test(page), true, 'block colour and single-row colour both checked')
eq(/R-SHEET-01/.test(readFileSync('rules.md', 'utf8')), true, 'rule written in rules.md')

// ── Keyboard + drag selection ──
eq(/onKeyDownCapture=\{handleEditorArrows\}/.test(page), true, 'arrow keys leave an open dropdown (Start time …) instead of getting stuck')
eq((page.match(/onMouseEnter=\{\(\) => handleCellMouseEnter/g) || []).length, 2 , 'drag selection in grid and Block mode')
eq(/many\.length && isInSel\(rowIdxOf, colId\)/.test(page), true, 'colour fill applies to every selected cell')

// ── Add Employee ──
const form = readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')
eq(form.indexOf('name="short_name"') < form.indexOf('name="phone"') && form.indexOf('name="phone"') < form.indexOf('name="gender"'), true, 'Short Name right under Full Name')
eq(/switch automatically/.test(form), false, 'helper text removed')
eq(/name="total_duty_hours"/.test(form) && /\[6, 8, 10, 12\]/.test(form) && /name="date_of_birth"/.test(form), true, 'Total Duty Hours (pick or type) + Date of Birth')
eq(/uploadText="Upload Image and PDF"/.test(form), true, 'Other Documents text')
eq(deleteVersion([{ id: '1', category: 'eid', uploaded_at: '' }, { id: '2', category: 'eid', uploaded_at: '' }], '1').map(d => d.id), ['2'], 'Delete removes the file from the record')
eq(/deletedCats\.has\(c\)/.test(form) && /deletedCats\.size > 0 \? docsList/.test(form), true, 'a deleted document does not come back on save')
const sql = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
eq(['date_of_birth', 'total_duty_hours'].every(c => new RegExp(`alter table public\\.employees add column if not exists ${c}\\b`).test(sql)), true, 'columns for the two new fields')
