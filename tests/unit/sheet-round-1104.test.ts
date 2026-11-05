// R-PAY-05 split rows, R-ATT-08 away cleaners, R-SCHED-05 contract stop, R-CLI-01 address format, UX-71..73
import fs from 'node:fs'
import { expandTeamJob } from '@/lib/excelTeams'
import { withSplitEntry, isSplitJob } from '@/lib/chargeSplit'
import { awayCleanerNames, isAwayMark, type AttendanceOverride } from '@/lib/attendance'
import { isMonthlyContractStopped } from '@/lib/clientDataSync'
import { formatClientAddress } from '@/lib/clientAddress'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// Split Mode: every cleaner's row carries their own money; Lump Sum keeps it on the lead
const split = [
  { cleaner: 'Asmita', charges: 45, received: 500, payment_mode: 'Cash' },
  { cleaner: 'Bimala', charges: 60, received: 50, payment_mode: 'Online' },
]
const job = { id: 'j1', date: '2026-11-04', staff_name: 'Asmita, Bimala', charges: 105, received: 550, payment_mode: 'Cash', charge_split: split } as unknown as DailyJob
const rows = expandTeamJob(job, 'Team A1')
eq(rows.map(r => [r.staff_name, r.charges, r.received, r.payment_mode]), [['Asmita', 45, 500, 'Cash'], ['Bimala', 60, 50, 'Online']], 'split rows hold their own money')
const lump = expandTeamJob({ ...job, charge_split: undefined }, 'Team A1')
eq(lump.map(r => [r.charges, r.received, r.payment_mode]), [[105, 550, 'Cash'], [0, 0, 'Above']], 'lump sum stays on the lead')
eq(isSplitJob(job) && !isSplitJob({ charge_split: [] }), true, 'split job detected')
const edited = withSplitEntry(job, 'bimala', { received: 60 })
eq([edited.charges, edited.received, edited.charge_split?.[1].received], [105, 560, 60], 'editing one cleaner updates their line and the totals')

// Away cleaners (absent, pending or approved leave), by id or by name
const marks: Record<string, AttendanceOverride> = {
  '2026-11-03_id:emp-dj-adnan': { status: 'absent', updatedAt: '' },
  '2026-11-03_sita': { status: 'on_leave', approval: 'pending', updatedAt: '' },
  '2026-11-03_rupa': { status: 'present', updatedAt: '' },
  '2026-11-04_id:emp-dj-adnan': { status: 'available', updatedAt: '' },
}
const staff = [{ id: 'emp-dj-adnan', full_name: 'Adnan' }]
eq([...awayCleanerNames(marks, staff, '2026-11-03')].sort(), ['adnan', 'sita'], 'absent by id and leave by name are away')
eq([...awayCleanerNames(marks, staff, '2026-11-04')], [], 'available next day is not away')
eq([isAwayMark({ status: 'on_leave', approval: 'approved', updatedAt: '' }), isAwayMark(undefined)], [true, false], 'approved leave counts')

// Monthly contracts
const c = { full_name: 'Akash Younas' }
eq(isMonthlyContractStopped(c, []), false, 'no contract record keeps syncing')
eq(isMonthlyContractStopped(c, [{ clientName: 'akash younas', status: 'cancelled' }]), true, 'cancelled contract stops the sync')
eq(isMonthlyContractStopped(c, [{ clientName: 'Akash Younas', status: 'paused' }, { clientName: 'Akash Younas', status: 'active' }]), false, 'one active contract keeps it running')

// Address format
eq(formatClientAddress({ apartment: '302', building_name: 'Al Khair Building', area: 'Mirdif' }), '302, Al Khair Building, Mirdif', 'number, building, area')
eq(formatClientAddress({ apartment: 'Villa 25', area: 'Mirdif', city: 'Dubai' }, true), 'Villa 25, Mirdif, Dubai', 'villa with city')

// Sheet wiring
// CODE-A01: the column list moved to src/lib/excelSheet/columns.ts
const sheet = fs.readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8') + fs.readFileSync('src/lib/excelSheet/columns.ts', 'utf8')
eq(/id: 'advance',\s+label: 'Advance'/.test(sheet) && !/Adv`/.test(sheet), true, 'Advance column; Pending has no "+X Adv" text')
eq(/safaeewala_excel_column_align/.test(sheet) && /AlignCenter/.test(sheet), true, 'column alignment buttons, saved')
eq(/if \(teamColorMap\.byRow\(row\.id\)\) \{\s+rowBg = teamColorMap/.test(sheet), true, 'team colour comes before cleaner colours')
const form = fs.readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq(form.indexOf('name="apartment"') < form.indexOf('name="building_name"'), true, 'apartment / villa number field first')
