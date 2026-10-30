import * as XLSX from 'xlsx'
import { parseJobSheetWorkbook, extractDateFromFilename } from '@/lib/jobSheetImport'
import { buildRowChecks } from '@/lib/jobChecks'
import { buildCleanerRoster } from '@/lib/attendance'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }

eq(extractDateFromFilename('27-10-2026.xlsx', '2026-10-01'), '2026-10-27', 'file name dd-mm-yyyy')
eq(extractDateFromFilename('Job Sheet 2026-10-05.xlsx', '2026-10-01'), '2026-10-05', 'file name yyyy-mm-dd')

const ws = XLSX.utils.aoa_to_sheet([
  ['Staff', 'Start time', 'End time', 'Address', 'Location', 'Charges', 'Received', 'Duty Hrs', 'Mode', 'Service', 'Remarks'],
  ['TEST Rupa', '08:00', '12:00', 'TEST Villa 1', 'JLT', 200, 200, '', 'Cash', 'House', ''],
  ['', '13:00', '15:00', 'TEST Flat 2', 'Marina', 150, 0, '', 'Pending', 'Deep', ''],
  ['Gross', '', '', '', '', 350, 200, '', '', '', ''],
])
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Jobs')
const plan = parseJobSheetWorkbook(wb, '27-10-2026.xlsx', '2026-10-01')
eq(plan.date, '2026-10-27', 'plan date from file')
eq(plan.jobs.length, 2, 'two jobs, footer skipped')
eq(plan.jobs[1].staff_name, 'TEST Rupa', 'blank staff continues previous cleaner')
eq(plan.jobs[0].duty_hours, 4, 'duty from times')
eq(plan.jobs.every(j => j.date === '2026-10-27'), true, 'every row on the file date')

const job = (o: any) => ({ id: o.id, date: '2026-10-27', staff_name: 'TEST Rupa', start_time: '08:00', end_time: '12:00', address: 'A', area: '', charges: 100, received: 100, payment_mode: 'Cash', duty_hours: 4, ot_hours: 0, is_overtime: false, material: 'No', service: '', remarks: '', created_at: '', ...o })
const emps: any[] = [{ id: 'e1', full_name: 'TEST Rupa', status: 'active' }]
const checks = buildRowChecks([
  job({ id: '1' }),
  job({ id: '2', start_time: '14:00', end_time: '10:00', address: 'B' }),
  job({ id: '3', received: 150, address: 'C' }),
  job({ id: '4', staff_name: 'Nobody', address: 'D' }),
  job({ id: '5' }),
  job({ id: '6', payment_mode: 'Monthly', address: 'E' }),
] as any, emps as any)
eq(checks.has('1'), true, 'duplicate flagged (first)')
eq(checks.has('5'), true, 'duplicate flagged (second)')
eq(checks.get('2')?.[0]?.startsWith('Ends before'), true, 'end before start')
eq(checks.get('3')?.[0]?.startsWith('Received'), true, 'received > charges')
eq(checks.get('4')?.[0]?.startsWith('Not a registered'), true, 'unregistered staff')
eq(checks.get('6')?.[0]?.startsWith('Monthly'), true, 'monthly with money')

const roster = buildCleanerRoster(emps as any, [
  job({ id: 'a', staff_name: 'TEST Sita, TEST Gita', date: '2026-10-20' }),
  job({ id: 'b', staff_name: 'Old Person', date: '2026-01-01' }),
] as any, '2026-10-27')
eq(roster, ['TEST Gita', 'TEST Rupa', 'TEST Sita'], 'roster: employees + recent split names, no old/hard-coded names')
