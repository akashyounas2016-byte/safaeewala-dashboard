// UX-183..187, R-EMP-17, R-MKT-06 (2026-11-20, second list)
import { readFileSync } from 'node:fs'
import { findNameClash } from '@/lib/staffRoles'
import { applyRowPatch, applyCellPatch } from '@/lib/excelSheet/undo'
import { areaOf, presetDates, clicksBetween, type WhatsAppClick } from '@/lib/whatsappClicks'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// R-EMP-17: names told apart
const emps = [{ id: '1', full_name: 'Ambika', short_name: 'Ambika' }, { id: '2', full_name: 'Ambika Devi Tharu', short_name: 'Ambika D' }]
eq(findNameClash(emps, { full_name: 'ambika  devi tharu' })?.employee.id, '2', 'same full name (case / spaces) is refused')
eq(findNameClash(emps, { full_name: 'Ambika Rai', short_name: 'Ambika' })?.field, 'short name', 'a Short Name already shown for someone else is refused')
eq(findNameClash(emps, { full_name: 'Ambika Rai', short_name: 'Ambika R' }), null, 'a distinct name is fine')
eq(findNameClash(emps, { full_name: 'Ambika Devi Tharu', short_name: 'Ambika D' }, '2'), null, 'editing yourself is fine')

// UX-184: undo as a patch, after an auto-save and with another user's change in between
const r = (id: string, remarks = '') => ({ id, staff_name: 'A', remarks }) as DailyJob
const before = [r('new_1'), r('j2', 'old')]
const after = [r('new_1', 'typed'), r('j2', 'old')]
const now = [r('uuid-9', 'typed'), r('j2', 'changed by Shani')] // saved under a new id; j2 changed elsewhere
const undone = applyRowPatch(now, after, before, id => (id === 'new_1' ? 'uuid-9' : id))
eq(undone.map(x => [x.id, x.remarks]), [['uuid-9', ''], ['j2', 'changed by Shani']], 'undo empties only its own row (under the saved id), the other change stays')
eq(applyRowPatch(undone, before, after, id => (id === 'new_1' ? 'uuid-9' : id)).map(x => x.remarks), ['typed', 'changed by Shani'], 'redo puts it back')
eq(applyRowPatch([r('j2')], [r('j1'), r('j2')], [r('j2')]).map(x => x.id), ['j2'], 'an undo of a delete…')
eq(applyRowPatch([r('j2')], [r('j2')], [r('j1'), r('j2')]).map(x => x.id), ['j1', 'j2'], '…puts the row back in its place')
eq(applyCellPatch({ a_x: 'red', b_y: 'blue' }, { a_x: 'red' }, {}), { b_y: 'blue' }, 'a cell colour change is undone on its own')

// R-MKT-06: dates and areas of clicks
eq(presetDates('yesterday', '2026-11-20'), { from: '2026-11-19', to: '2026-11-19' }, 'yesterday')
eq(presetDates('7', '2026-11-20'), { from: '2026-11-14', to: '2026-11-20' }, 'last 7 days include today')
const c = (id: string, at: string, url = '') => ({ id, clicked_at: at, page_url: url }) as WhatsAppClick
eq(clicksBetween([c('a', '2026-11-19T21:00:00Z'), c('b', '2026-11-19T10:00:00Z')], '2026-11-20', '2026-11-20').map(x => x.id), ['a'], 'Dubai date (01:00 on 20 Nov) counts for 20 Nov')
eq(areaOf(c('x', '', 'https://safaeewala.com/maid-service-jlt/'), ['Dubai Marina', 'Jumeirah Lake Towers (JLT)']), 'Jumeirah Lake Towers (JLT)', 'area from the page link')
eq(areaOf(c('x', '', 'https://safaeewala.com/contact-us/'), ['Dubai Marina']), 'No area', 'no area on the page')

const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/Math\.max\(12, resizingCol\.startWidth/.test(sheet), true, 'columns resize down to 12 px (UX-185)')
eq(/document\.addEventListener\('cut', onCut\)/.test(sheet), true, 'Ctrl+X cuts (UX-184)')
eq(/Staff \(not yet on this sheet\)/.test(sheet) && !/list="xl-staff"/.test(sheet), true, 'staff cell uses the Address dropdown design (UX-186)')
eq(/b\.blockRowIdx === 0/.test(sheet), true, 'block OT on the top row (UX-187)')
const picker = readFileSync('src/components/common/CleanerMultiSelect.tsx', 'utf8')
eq(/technicalToggle/.test(picker) && /role === 'csr'\) return/.test(picker), true, 'Technical switch, never a CSR (UX-183)')
