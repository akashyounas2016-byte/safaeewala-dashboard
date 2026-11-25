// 2026-11-25: Charges follow the hours when a time is picked or typed (R-SHEET-05); Employees page with a null skills list
import { readFileSync } from 'node:fs'
import { syncDutyWithTimes, syncHourlyCharges } from '@/lib/excelSheet/rows'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// The owner's case: Asmita 12–1 PM at AED 10 / hr → end time 2 PM → 2 h, AED 20
const row = { start_time: '12:00 PM', end_time: '02:00 PM', duty_hours: 1, ot_hours: 0, charges: 10, charges_per_hour: 10 }
const after = syncHourlyCharges(syncDutyWithTimes(row, false), 'end_time')
eq([after.duty_hours, after.charges], [2, 20], '12–2 PM at 10 / hr → 2 h, charges 20')
eq(syncHourlyCharges(syncDutyWithTimes({ ...row, charges_per_hour: 0, charges: 150 }, false), 'end_time').charges, 150, 'no rate → charges stay as typed')

const sheet = src('src/pages/JobSheetSpreadsheet.tsx')
eq(/updated\[rowIdx\] = syncHourlyCharges\(syncDutyWithTimes\(r, /.test(sheet), true, 'time picked from the list / typed + Enter redoes charges')
eq(/colId === 'start_time' \|\| colId === 'end_time'\) && !newVal\.startsWith\('='\)\) Object\.assign\(row, syncDutyWithTimes/.test(sheet), true, 'time typed in the formula bar redoes duty hours too')

const emp = src('src/pages/Employees.tsx')
eq(/for \(const s of e\.skills \?\? \[\]\)/.test(emp) && !/emp\.skills\.(slice|length)/.test(emp), true, 'Employees page: a record without skills does not crash it')
