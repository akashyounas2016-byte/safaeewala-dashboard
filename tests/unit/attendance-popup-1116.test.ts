// UX-157 (2026-11-16): Excel sheet Attendance popup — follows the sheet, photos, cards, saves only with Save
import { readFileSync } from 'node:fs'
import { quickStatusOf } from '@/components/dailyJobSheet/QuickAttendanceModal'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const at = ''
eq([quickStatusOf({ status: 'available', updatedAt: at }, true), quickStatusOf({ status: 'present', updatedAt: at }, false)], ['present', 'available'],
  'an old Present / Available mark does not beat the sheet: job → Present, no job → Available')
eq([quickStatusOf({ status: 'absent', updatedAt: at }, true), quickStatusOf({ status: 'on_leave', updatedAt: at }, true)], ['absent', 'on_leave'], 'only Absent / Leave beat the sheet')

const m = readFileSync('src/components/dailyJobSheet/QuickAttendanceModal.tsx', 'utf8')
const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/size="2xl"/.test(m), true, 'wider popup')
eq(/r\.emp\.photo_url\s*\?\s*<img src=\{r\.emp\.photo_url\}/.test(m), true, 'cleaner photo next to the name (initials when none)')
eq(/md:grid-cols-5/.test(m) && /Math\.round\(\(n \/ rows\.length\) \* 100\)/.test(m), true, 'cards: Cleaners + 4 statuses with %')
eq(/stage\(r, s === 'absent'/.test(m) && !/saveAttendanceMarks\(changes\)\s*\n\s*\}\s*\n\s*const set =/.test(m), true, 'a click only stages the change')
eq(/const save = \(\) => \{[\s\S]*saveAttendanceMarks\(changes\)/.test(m) && /onClick=\{save\} disabled=\{pending\.size === 0\}/.test(m), true, 'Save button saves them, off while nothing changed')
eq(/Close without saving\?/.test(m), true, 'Close with unsaved changes asks first')
eq(/sheetJobs=\{gridRows\.filter\(r => r\.date === effectiveTargetDate && !isClearedRow\(r\)\)\}/.test(sheet), true, 'uses the sheet\'s own rows (unsaved too)')
eq(/n\.trim\(\)\.toLowerCase\(\) === short/.test(m), true, 'matches the Short Name shown on the sheet')
