// Round 2026-11-05 (b): header alignment, Void invoices, Bi-Weekly sync, staff-role columns, field-login SQL
import { readFileSync } from 'node:fs'
import { canAccessModule, permRoleOf, normalizeRolePerms, DEFAULT_ROLE_PERMS, firstAllowedPath } from '@/lib/permissions'
import { invoiceBalance, invoicedJobIds } from '@/lib/receivables'
import { biweeklyVisitOn, biweeklyVisitDates, type BiWeeklyPlan } from '@/lib/biweekly'
import { getScheduledMonthlyShiftsForDate } from '@/lib/clientDataSync'
import type { Client, DailyJob, Invoice } from '@/types'
import { jobFlags, splitSyncNote } from '@/lib/jobFlags'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// UX-85: the column header follows the column's alignment
eq(/justify-end' : alignClass\(col\)\.includes\('text-center'\) \? 'justify-center'/.test(src('src/pages/JobSheetSpreadsheet.tsx')), true, 'header aligns with its column')

// INV-A07: a void invoice counts nowhere and frees its jobs
const inv = (status: Invoice['status']) => ({ total: 105, status, amount_paid: 0, job_ids: ['j1'] }) as unknown as Invoice
eq(invoiceBalance(inv('void')), 0, 'void invoice has no balance')
eq(invoiceBalance(inv('sent')), 105, 'sent invoice keeps its balance')
eq(invoicedJobIds([inv('void')]).has('j1'), false, 'jobs of a void invoice can be billed again')
eq(/Delete Draft Invoice/.test(src('src/pages/Invoices.tsx')) && /Void invoice/.test(src('src/pages/Invoices.tsx')), true, 'only drafts are deleted; issued invoices are voided')
eq(/error\.code !== '23505'/.test(src('src/store/DataContext.tsx')), true, 'a taken invoice number (unique index) is retried with the next one')

// R-SCHED-07: Bi-Weekly visits on the chosen days, every week by default
const plan: BiWeeklyPlan = {
  days: ['Wednesday'], start_date: '2026-11-04', months: 1,
  day_schedules: { Wednesday: { startTime: '09:00 AM', endTime: '12:00 PM', cleaner: 'Ambika', duration: 3 } },
}
eq(biweeklyVisitDates(plan), ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02'], 'every week by default')
eq(biweeklyVisitDates({ ...plan, every_weeks: 2 }), ['2026-11-04', '2026-11-18', '2026-12-02'], 'every other week when chosen')
eq(biweeklyVisitOn(plan, '2026-11-11')?.cleaner, 'Ambika', 'visit carries the day cleaner')
eq(biweeklyVisitOn(plan, '2026-11-12'), null, 'no visit on other days')
eq(biweeklyVisitOn(plan, '2026-12-09'), null, 'no visit after the contract')
const client = { id: 'c1', full_name: 'TEST Bi Client', building_name: 'Marina Tower', apartment: '12', area: 'Marina', service_mode: 'biweekly', biweekly_plan: plan } as unknown as Client
const day = getScheduledMonthlyShiftsForDate('2026-11-11', [client], [])
eq(day.shifts.map(s => [s.address, s.cleanerName, s.startTime, s.paymentMode]), [['Marina Tower Apt 12 - TEST Bi Client', 'Ambika', '09:00 AM', 'Cash']], 'Bi-Weekly visit goes to the Daily Job Sheet sync')
eq(getScheduledMonthlyShiftsForDate('2026-11-12', [client], []).shifts.length, 0, 'not on a day the client did not pick')

// R-SEC-07: Supervisor / Driver / Cleaner columns
eq([permRoleOf('employee', 'driver'), permRoleOf('employee', 'cleaner'), permRoleOf('employee', 'ducting'), permRoleOf('employee', 'supervisor'), permRoleOf('employee', null), permRoleOf('manager', 'driver')],
  ['driver', 'cleaner', 'cleaner', 'supervisor', 'employee', 'manager'], 'staff role picks the column')
eq(canAccessModule('employee', DEFAULT_ROLE_PERMS, 'Clients', 'driver'), false, 'driver: no office screens by default')
eq(canAccessModule('employee', DEFAULT_ROLE_PERMS, 'My Duties', 'cleaner'), true, 'cleaner: My Duties')
eq(firstAllowedPath('employee', DEFAULT_ROLE_PERMS, 'driver'), '/my-duties', 'driver lands on My Duties')
const custom = normalizeRolePerms({ driver: ['My Duties', 'Drivers'] })
eq(canAccessModule('employee', custom, 'Drivers', 'driver'), true, 'admin can give a driver more screens')
eq(custom.cleaner, ['My Duties'], 'missing columns keep their defaults')
// UX-88: the side widgets show on the Company tab only; every other tab (Roles included) uses the full width
eq(/activeTab === 'company' \? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1'/.test(src('src/pages/Settings.tsx')) && /\{activeTab === 'company' && \(/.test(src('src/pages/Settings.tsx')), true, 'side widgets on the Company tab only')

// UX-86: the sync note leaves Remarks and becomes a flag next to the cleaner
const note = splitSyncNote('Monthly Contract · ⚠ Ambika is already booked 09:00–12:00 at Office Luxam Trading DMCC: assign a cleaner')
eq([note.text, note.note?.cleaner, note.note?.at], ['Monthly Contract', 'Ambika', 'Office Luxam Trading DMCC'], 'note split from the remarks')
const jobRow = (staff: string) => ({ id: 'j9', staff_name: staff, remarks: 'Monthly Contract · ⚠ Ambika is already booked 09:00–12:00 at Office Luxam: assign a cleaner' }) as unknown as DailyJob
eq(jobFlags(jobRow(''), null).map(f => f.level), ['open'], 'no cleaner yet → amber flag')
eq(jobFlags(jobRow('Bimala'), null).map(f => f.level), ['history'], 'cleaner assigned, no clash → grey history flag')
eq(jobFlags({ ...jobRow('Bimala'), remarks: '' } as DailyJob, { staff: 'Bimala', job: jobRow('Bimala') }).map(f => f.level), ['clash'], 'live clash → red flag')
eq(jobFlags({ ...jobRow('Bimala'), remarks: 'Monthly Contract' } as DailyJob, null).length, 0, 'plain remarks → no flag')

// UX-87: Copy works on http too (VPS address)
eq(/document\.execCommand\('copy'\)/.test(src('src/lib/clipboard.ts')), true, 'copy has a fallback without navigator.clipboard')
eq(['src/components/settings/UserManagement.tsx', 'src/pages/Settings.tsx', 'src/pages/FluentFormsLeads.tsx', 'src/pages/ClientProfile.tsx', 'src/components/dailyJobSheet/GoogleDriveWebhookModal.tsx']
  .some(f => /navigator\.clipboard/.test(src(f))), false, 'no Copy button calls navigator.clipboard directly')

// SEC-A03: field logins limited in the database
const sql = src('supabase/migrations/2026-11-05_field_login_rows.sql')
eq(/as restrictive for select/.test(sql) && /is_my_job/.test(sql) && /is_my_client/.test(sql), true, 'field logins read only their own rows')
eq(/when me\.col in \('driver', 'cleaner'\) then '\["My Duties"\]'/.test(sql), true, 'SQL defaults match the app')
