// 2026-11-11 (round 3): a row removed on the Excel sheet is deleted from the Daily Job Sheet without a
// "Not saved" conflict (R-SYNC-17); a monthly client saved without a cleaner stays empty, never "Unassigned" (R-SCHED-10)
import { readFileSync } from 'node:fs'
import { isClearedRow } from '@/lib/excelSheet/rows'
import { getClientShiftDetailsForDay, getScheduledMonthlyShiftsForDate, realCleanerName, rememberRemovedMonthlyVisits, REMOVED_VISITS_KEY } from '@/lib/clientDataSync'
import { CLOUD_SYNCED_KEYS } from '@/lib/cloudState'
import { scheduleCleanerAlerts } from '@/lib/alerts'
import type { Client, DailyJob, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const row = (extra: Record<string, unknown>) =>
  ({ id: 'j1', date: '2026-11-11', staff_name: 'Gyan', start_time: '', end_time: '', address: '', area: '', charges: 0, received: 0, remarks: '', payment_mode: 'Cash', ...extra }) as unknown as DailyJob
const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')

// ── R-SYNC-17: an emptied row is a deletion ──
eq([isClearedRow(row({})), isClearedRow(row({ start_time: '—', end_time: '—' })), isClearedRow(row({ start_time: '09:00 AM' })), isClearedRow(row({ address: 'Marina' }))],
  [true, true, false, false], 'Delete Row / Clear Row Contents leave a cleared row; a time or an address keeps it a job')
eq(/const plainRemoved = \[\.\.\.removed, \.\.\.edited\.filter\(emptiedHere\)\]/.test(page), true, 'a saved row emptied in the grid is deleted, not saved as an empty job')
eq(/isClearedRow\(r\) && !isClearedRow\(loadedSnapshot\.get\(r\.id\) \?\? r\)/.test(page), true, 'only rows emptied in this edit (a job that was already empty is not deleted for a colour change)')
eq(/const changedElsewhere = \[\s*\.\.\.plainEdited\.filter/.test(page), true, 'a deletion is never reported as "changed on another screen"')
eq(/splitOrigin\(r\) === jobId && !isClearedRow\(r\)/.test(page), true, 'an emptied cleaner row leaves the team job; the others keep their details')
eq(/if \(was && goneHere\(id\)\) \{ nextRaw\.set/.test(page), true, 'a row deleted here is not brought back by a live update')
eq(/if \(goneHere\(id\)\) \{ \/\/ deleted here and elsewhere/.test(page), true, 'deleted on both screens — no conflict')

// ── R-SYNC-17: a deleted monthly visit is not added again by the monthly sync ──
const monthly = {
  id: 'cv', full_name: 'TEST Visit Client', building_name: 'TEST Tower', area: 'Marina', service_days: ['Monday'],
  scheduled_time: '09:00 AM', end_time: '01:00 PM', duration_hours: 4, preferred_cleaner: 'Gyan', source: 'monthly',
} as unknown as Client
const MON = '2026-11-16'
eq(getScheduledMonthlyShiftsForDate(MON, [monthly], []).pendingSyncCount, 1, 'a Monday visit is due')
const visit = getScheduledMonthlyShiftsForDate(MON, [monthly], []).shifts[0]
const synced = row({ id: 'v1', date: MON, address: visit.address, start_time: '09:00 AM', end_time: '01:00 PM' })
eq(getScheduledMonthlyShiftsForDate(MON, [monthly], [synced]).pendingSyncCount, 0, 'its job is on the sheet')
rememberRemovedMonthlyVisits(synced, [monthly])
eq(getScheduledMonthlyShiftsForDate(MON, [monthly], []).pendingSyncCount, 0, 'deleted → not added again (app start, Daily Job Sheet, Sync button)')
eq(getScheduledMonthlyShiftsForDate('2026-11-23', [monthly], []).pendingSyncCount, 1, 'only that date — next Monday is still added')
eq((CLOUD_SYNCED_KEYS as readonly string[]).includes(REMOVED_VISITS_KEY), true, 'the list is shared by every device (app_state)')
eq(/if \(gone\) rememberRemovedMonthlyVisits\(gone, allClients\)/.test(readFileSync('src/store/DataContext.tsx', 'utf8')), true, 'every job deletion is remembered')

// ── R-SCHED-10: no "Unassigned" cleaner ──
eq([realCleanerName('Unassigned'), realCleanerName(' unassigned '), realCleanerName(''), realCleanerName(null), realCleanerName(' Gyan ')], ['', '', '', '', 'Gyan'], 'the word "Unassigned" is read as no cleaner')
const legacy = {
  id: 'c1', full_name: 'TEST Monthly', service_days: ['Monday'], scheduled_time: '09:00', end_time: '13:00', duration_hours: 4,
  preferred_cleaner: '', day_cleaner_assignments: { Monday: 'Unassigned' },
  day_schedules: { Monday: { startTime: '09:00', endTime: '13:00', cleaner: 'Unassigned', duration: 4 } },
} as unknown as Client
eq(getClientShiftDetailsForDay(legacy, 'Monday' as never).cleanerName, '', 'an old client saved with "Unassigned" adds its visits without a cleaner')
eq(scheduleCleanerAlerts([legacy], [] as Employee[]).length, 0, 'no "cleaner who is not an employee: Unassigned" alert')
const form = readFileSync('src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'utf8')
eq([/\|\| 'Unassigned'/.test(form), /if \(cleaner\) finalAssignments\[day\] = cleaner/.test(form)], [false, true], 'the form saves no cleaner as empty, never "Unassigned"')
