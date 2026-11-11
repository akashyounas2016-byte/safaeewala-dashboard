// 2026-11-11 (round 2): dropdown keyboard (UX-142), inactive staff (R-EMP-12), "changed on another screen" (R-SYNC-16),
// replacement only for real monthly clients (UX-141), no bare "Busy" (UX-140), removed time clears Duty Hrs (UX-139)
import { readFileSync } from 'node:fs'
import { busyCleaners } from '@/lib/staffBusy'
import { sameJobRow, syncDutyWithTimes } from '@/lib/excelSheet/rows'
import { isAssignable } from '@/lib/staffRoles'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const job = (id: string, staff: string, s: string, e: string, extra: Record<string, unknown> = {}) =>
  ({ id, date: '2026-11-11', staff_name: staff, start_time: s, end_time: e, address: 'X', charges: 0, received: 0, payment_mode: 'Cash', ...extra }) as unknown as DailyJob
const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')

// ── UX-140: no "Busy" for an empty row ──
const rows = [job('idle', 'Dipak Sada', '', '', { address: '' }), job('j', 'Gyan', '09:00 AM', '01:00 PM'), job('d', 'Ishwor', '10:00 AM', '', { duty_hours: 3 })]
const busy = busyCleaners(rows, '2026-11-11', { today: '2026-11-11', nowMin: 8 * 60 })
eq([busy.has('dipak sada'), busy.get('gyan')?.until, busy.get('ishwor')?.until], [false, '1:00 PM', '1:00 PM'], 'empty cleaner row is not busy; every Busy tag has a time')

// ── UX-139: removing a time clears Duty Hrs / OT ──
eq([syncDutyWithTimes({ start_time: '', end_time: '01:00 PM', duty_hours: 3, ot_hours: 1 }).duty_hours, syncDutyWithTimes({ start_time: '', end_time: '', duty_hours: 3, ot_hours: 1 }).ot_hours], [0, 0], 'a removed time clears Duty Hrs and OT')
eq(syncDutyWithTimes({ start_time: '09:00 AM', end_time: '', duty_hours: 4 }, false).duty_hours, 4, 'typing the first time keeps the hours until the second one is there')
eq(syncDutyWithTimes({ start_time: '09:00 AM', end_time: '01:30 PM', duty_hours: 0 }).duty_hours, 4.5, 'both times → worked out')
eq((page.match(/syncDutyWithTimes\(/g) || []).length, 3, 'typed, picked and Delete all use it')

// ── R-SYNC-16: OT alone is not a change; conflicts use the saved job ──
eq(sameJobRow(job('a', 'Uma', '09:00 AM', '01:00 PM', { ot_hours: 0 }), job('a', 'Uma', '09:00 AM', '01:00 PM', { ot_hours: 2 })), true, 'OT worked out again is not an unsaved change / not "changed elsewhere"')
eq(sameJobRow(job('a', 'Uma', '09:00 AM', '01:00 PM'), job('a', 'Uma', '09:00 AM', '02:00 PM')), false, 'a real change still counts')
eq(/const was = loadedRawRef\.current\.get\(r\.id\)/.test(page) && /loadedRawRef\.current = new Map\(clone\(periodJobs\)/.test(page), true, 'live job compared with the job as loaded, not with a team member row')
eq(/const fresh = expandTeamJob\(clone\(\[job\]\)\[0\], teamRef\)/.test(page), true, 'a team job changed elsewhere comes back as its cleaner rows')

// ── R-EMP-12: inactive staff are never offered ──
eq([isAssignable({ status: 'inactive', role: 'cleaner' }), isAssignable({ status: 'active', role: 'csr' }), isAssignable({ status: 'on_leave', role: 'cleaner' })], [false, false, true], 'inactive and CSR not assignable')
eq(/!isAssignable\(r\)/.test(readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')), true, 'Add Job (Excel / Daily Job Sheet / Booking)')
eq((readFileSync('src/components/bookings/NewBookingModal.tsx', 'utf8').match(/filter\(isAssignable\)/g) || []).length, 2, 'Booking pickers')
eq(/e\.status !== 'inactive' && e\.role !== 'csr'/.test(readFileSync('src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'utf8')), true, 'Monthly client cleaner list')

// ── UX-141: replacement only for real monthly-contract clients ──
eq(/monthlyJobsNeedingCover\(gridRows, effectiveTargetDate, away, clients\)/.test(page), true, 'banner checks the client record')

// ── UX-142: keyboard inside an open dropdown ──
const pop = readFileSync('src/components/dailyJobSheet/ExcelCellPopover.tsx', 'utf8')
eq(/export function popoverMove/.test(pop) && /data-xl-item/.test(pop), true, 'dropdown items can be walked with the keys')
eq(/popoverMove\(e\.key === 'ArrowDown' \? 1 : -1\)/.test(page) && /e\.key === 'Enter' && popoverPick\(\)/.test(page), true, 'Down / Up move inside the list, Enter picks')
eq(/e\.altKey && e\.key === 'ArrowDown' && DROPDOWN_COLS\.has/.test(page), true, 'Alt + Down opens the dropdown of the selected cell')
