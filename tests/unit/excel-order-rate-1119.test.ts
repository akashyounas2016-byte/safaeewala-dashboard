// UX-174 / UX-175 (2026-11-19): fixed A→Z cleaner blocks on Excel; charges per hour
import { readFileSync } from 'node:fs'
import { orderBlocksByName, syncHourlyCharges, ensureThreeRowsPerStaff, withIdleCleaners } from '@/lib/excelSheet/rows'
import { memberModeLabel } from '@/lib/excelSheet/sheetConfig'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const j = (id: string, staff: string, extra: Partial<DailyJob> = {}) => ({ id, date: '2026-11-19', staff_name: staff, start_time: '09:00', end_time: '11:00', duty_hours: 2, address: 'A', charges: 0, received: 0, ...extra }) as DailyJob
const names = (rows: DailyJob[]) => Array.from(new Set(rows.map(r => r.staff_name)))
eq(names(orderBlocksByName([j('1', 'Uma Kumari'), j('2', 'Ambika'), j('3', ''), j('4', 'Asmita')])), ['Ambika', 'Asmita', 'Uma Kumari', ''], 'blocks A→Z, no cleaner last')
const paidFirst = withIdleCleaners(ensureThreeRowsPerStaff([j('1', 'Uma Kumari', { received: 100 }), j('2', 'Ambika')], '2026-11-19'), [{ name: 'Asmita', status: 'Available' }], '2026-11-19')
eq(names(paidFirst), ['Ambika', 'Asmita', 'Uma Kumari'], 'a paid job, a job order or an idle cleaner does not move blocks')
const team = withIdleCleaners(ensureThreeRowsPerStaff([j('1', 'Uma Kumari, Ambika', { charges: 300 })], '2026-11-19'), [{ name: 'Asmita', status: 'Available' }], '2026-11-19')
eq(names(team), ['Ambika', 'Asmita', 'Uma Kumari'], 'a team job keeps the A→Z order too')
eq(memberModeLabel(j('m', 'Uma Kumari', { payment_mode: 'Above' as DailyJob['payment_mode'] })), 'Team', 'member mode shows "Team", not "Above" (the lead may be below)')
eq(syncHourlyCharges({ charges: 0, charges_per_hour: 60, duty_hours: 2.5 }, 'charges_per_hour').charges, 150, 'rate × hours = charges')
eq(syncHourlyCharges({ charges: 150, charges_per_hour: 60, duty_hours: 3 }, 'duty_hours').charges, 180, 'more hours at the same rate → more charges')
eq(syncHourlyCharges({ charges: 200, charges_per_hour: 60, duty_hours: 4 }, 'charges').charges_per_hour, 50, 'typed charges → rate worked out')
eq(syncHourlyCharges({ charges: 99, charges_per_hour: 0, duty_hours: 3 }, 'duty_hours').charges, 99, 'no rate → charges stay as typed')
const card = readFileSync('src/components/dailyJobSheet/ChargesCard.tsx', 'utf8')
eq(card.indexOf('>Charges Per Hour<') > 0 && card.indexOf('>Charges Per Hour<') < card.indexOf('>Advance Received<'), true, 'Add Job: Charges Per Hour before Advance Received')
const add = readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')
eq(/charges_per_hour: useSplit \? undefined : \(cleanNum\(rate\) \|\| undefined\)/.test(add), true, 'Add Job saves the rate (Excel Charges / Hr column)')
