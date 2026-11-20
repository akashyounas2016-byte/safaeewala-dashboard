// R-EMP-15 / R-EMP-16 / UX-179..182 (2026-11-20)
import { readFileSync } from 'node:fs'
import { kindFromBytes } from '@/lib/docStorage'
import { isEmployedOn, employmentStart } from '@/lib/staffRoles'
import { orderBlocksCustom, syncHourlyCharges } from '@/lib/excelSheet/rows'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const bytes = (...b: number[]) => new Uint8Array(b)
eq(kindFromBytes(bytes(0x25, 0x50, 0x44, 0x46, 0x2d)), 'pdf', 'a file without extension that starts with %PDF is a PDF (R-EMP-15)')
eq(kindFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image', 'JPEG bytes are an image')
eq(kindFromBytes(bytes(0x89, 0x50, 0x4e, 0x47)), 'image', 'PNG bytes are an image')
eq(kindFromBytes(bytes(0x50, 0x4b, 0x03, 0x04)), 'other', 'a zip is neither')

const emp = { joined_date: '2026-11-10', end_date: '2027-11-09' }
eq([isEmployedOn(emp, '2026-11-09'), isEmployedOn(emp, '2026-11-10'), isEmployedOn(emp, '2027-11-09'), isEmployedOn(emp, '2027-11-10')], [false, true, true, false], 'only inside Joined Date … Contract End (R-EMP-16)')
eq(employmentStart({ joined_date: '2026-11-10', training_start_date: '2026-11-01' }), '2026-11-01', 'an under-trainee starts at the Training Start')
eq(isEmployedOn({}, '2020-01-01'), true, 'no dates = no limit')

const j = (id: string, staff: string) => ({ id, staff_name: staff }) as DailyJob
const rows = [j('1', 'Ambika'), j('2', 'Asmita'), j('3', 'Ayesha'), j('4', 'Asmita'), j('5', '')]
eq(orderBlocksCustom(rows, { ayesha: 0, asmita: 1 }).map(r => r.id), ['3', '2', '4', '1', '5'], 'own block order first, the rest A→Z, empty last (UX-182)')
eq(orderBlocksCustom(rows, {}).map(r => r.id), ['1', '2', '3', '4', '5'], 'no order = rows as they are')

eq(syncHourlyCharges({ charges: 210, charges_per_hour: 50, duty_hours: 4 }, 'charges'), { charges: 210, charges_per_hour: 50, duty_hours: 4 }, 'typing Charges keeps the rate (UX-181)')
eq(syncHourlyCharges({ charges: 210, charges_per_hour: 50, duty_hours: 4 }, 'charges_per_hour').charges, 200, 'the rate fills Charges')

const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/UX-180[\s\S]{0,600}MutationObserver/.test(sheet), true, 'a cell dropdown closes when a popup opens (UX-180)')
eq(/Pending AED/.test(sheet) && /Advance AED/.test(sheet), true, 'Address dropdown shows Pending / Advance tags (UX-179)')
