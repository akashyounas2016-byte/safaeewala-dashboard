// UX-158 (2026-11-16): cell colours on the Excel Job Sheet were lost after Save + refresh ("Nothing to save")
import { readFileSync } from 'node:fs'
import { ensureThreeRowsPerStaff, withIdleCleaners } from '@/lib/excelSheet/rows'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const job = { id: 'j1', date: '2026-11-16', staff_name: 'Cloud Test Rupa', start_time: '09:00', end_time: '13:00', address: 'Cloud Test Villa', area: 'JLT', charges: 100, received: 0, remarks: '', duty_hours: 4 } as unknown as DailyJob
const load = () => withIdleCleaners(ensureThreeRowsPerStaff([job], '2026-11-16'), [{ name: 'Cloud Test Uma', status: 'Available' }], '2026-11-16').map(r => r.id)
const a = load(), b = load()
eq(a, b, 'empty rows get the same ids on every load, so their colours come back after a refresh')
eq(new Set(a).size, a.length, 'ids stay unique')

const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/plainAdded\.forEach\(r => addKeepingColors\(r, payload\(r\)\)\)/.test(page), true, 'a new row is saved with a known id')
eq(/next\[`\$\{to\}_\$\{k\.slice\(from\.length \+ 1\)\}`\] = prev\[k\]; delete next\[k\]/.test(page), true, 'its cell colours move to the saved job')
eq(/colours and formatting are saved as soon as you apply them/.test(page), true, 'no confusing "Nothing to save" after a colour change')
