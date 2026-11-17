// R-SCHED-23 / echo fix (browser audit 2026-11-17)
import { readFileSync } from 'node:fs'
import { sameJson } from '@/lib/cloudState'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const xl = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/dateFilterMode === 'range' && !!rangeStart && rangeStart === rangeEnd/.test(xl), true, 'Excel: a one-day range (how the sheet opens) adds that day\'s monthly visits')
eq(/if \(loading \|\| !isInitialDataLoaded\(\)\) return/.test(xl), true, 'Excel: no date is marked synced while the data is still loading')
eq([sameJson({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 }), sameJson({ a: 1 }, { a: 2 })], [true, false], 'same value in another key order is our own upload, not another user')
const cs = readFileSync('src/lib/cloudState.ts', 'utf8')
eq(/if \(sameJson\(row\.value, readLocal\(row\.key\)\)\)/.test(cs), true, 'echo of our own upload shows no "Another user changed" note')
