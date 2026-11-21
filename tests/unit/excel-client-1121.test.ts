// UX-188, UX-189, UX-190, R-CLI-14 (2026-11-21)
import { readFileSync } from 'node:fs'
import { sortBlockJobsByTime } from '@/lib/excelSheet/rows'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const j = (id: string, staff: string, start = '', date = '2026-11-21') => ({ id, staff_name: staff, start_time: start, date }) as DailyJob
const rows = [j('a1', 'Ambika', '04:00 PM'), j('a2', 'Ambika', '09:00 AM'), j('a3', 'Ambika'), j('b1', 'Bina', '13:00'), j('b2', 'Bina', '08:30')]
eq(sortBlockJobsByTime(rows).map(r => r.id), ['a2', 'a1', 'a3', 'b2', 'b1'], 'morning job first, empty rows last, blocks keep their order (UX-190)')
eq(sortBlockJobsByTime([j('x', 'A', '09:00 AM', '2026-11-22'), j('y', 'A', '04:00 PM', '2026-11-21')]).map(r => r.id), ['y', 'x'], 'over several days: date first, then time')

const app = readFileSync('src/App.tsx', 'utf8')
eq(/<Route element={<StandaloneShell \/>}>[\s\S]{0,200}daily-job-sheet\/spreadsheet/.test(app), true, 'the Excel sheet has the confirm dialog / toasts (UX-188)')
const shell = readFileSync('src/components/layout/StandaloneShell.tsx', 'utf8')
eq(/<ConfirmHost \/>/.test(shell) && /<Toaster/.test(shell) && /<FormGuard \/>/.test(shell), true, 'shell mounts ConfirmHost, Toaster, FormGuard')
const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/const setBlockColor = [\s\S]{0,1500}changeCellColors\(prev => \(\{ \.\.\.prev, \[key\]: paletteKey \}\)\)/.test(sheet), true, 'Staff cell colour is the cell only, not row_color (UX-189)')
const form = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq(/\+ Add another number/.test(form) && /patch\.other_phones = extra/.test(form), true, 'Add another number saves other_phones (R-CLI-14)')
