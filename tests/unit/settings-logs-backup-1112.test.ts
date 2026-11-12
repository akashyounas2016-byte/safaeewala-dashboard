// 2026-11-12: Activity Log with full detail (R-OPS-06), Data health opens the exact job and groups app errors
// by cause (R-OPS-07), Backup tab: one clear status + daily copies on this computer / Google Drive (R-OPS-08)
import { readFileSync } from 'node:fs'
import { diffRecord, changesText, changesOf, screenOfPath, describeJobChange } from '@/lib/auditLog'
import { recordLink } from '@/components/settings/ActivityLogPanel'
import { groupErrors, kindOf, type AppErrorReport } from '@/lib/errorReport'
import { oldBackupFiles, backupJson } from '@/lib/localBackup'
import { backupSummary } from '@/lib/backupStatus'
import { jobLink } from '@/lib/dataHealth'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// ── R-OPS-06: Activity Log ──
const before = { id: 'c1', full_name: 'TEST Client', phone: '050', area: 'Marina', photo: 'data:image/png;base64,AAA', updated_at: 'x' }
const ch = diffRecord(before, { full_name: 'TEST Client', phone: '055', area: '', photo: 'data:image/png;base64,BBB', updated_at: 'y', service_days: ['Monday', 'Friday'] })
eq(ch, [{ field: 'phone', from: '050', to: '055' }, { field: 'area', from: 'Marina', to: '' }, { field: 'service_days', from: '', to: 'Monday, Friday' }],
  'every changed field before → after; unchanged fields, photos / files and timestamps left out')
eq(changesText(ch), 'phone 050 → 055 · area Marina → — · service days — → Monday, Friday', 'readable text of the changes')
eq(describeJobChange({ start_time: '01:30 PM', charges: 100 }, { start_time: '09:30 AM', charges: 100 }), 'start time 01:30 PM → 09:30 AM', 'job edits keep the same text (row history)')
eq(changesOf({ action: 'updated', changes: null, details: 'start time 01:30 PM → 09:30 AM · duty hours 7 → 11 [Excel Job Sheet]' }),
  [{ field: 'start_time', from: '01:30 PM', to: '09:30 AM' }, { field: 'duty_hours', from: '7', to: '11' }], 'older text entries are read back into fields (times with spaces too)')
eq(changesOf({ action: 'status_changed', changes: null, details: 'confirmed → completed' }), [{ field: 'status', from: 'confirmed', to: 'completed' }], 'status changes')
eq([screenOfPath('/daily-job-sheet/spreadsheet'), screenOfPath('/daily-job-sheet'), screenOfPath('/clients/abc'), screenOfPath('/monthly-clients')],
  ['Excel Job Sheet', 'Daily Job Sheet', 'Client profile', 'Monthly Clients'], 'the screen a change was made on')
eq([recordLink({ entity: 'daily_job', entity_id: 'j1', entity_name: 'Ishwor · 2026-11-12', action: 'updated' }), recordLink({ entity: 'client', entity_id: 'c1', entity_name: 'X', action: 'updated' }), recordLink({ entity: 'client', entity_id: 'c1', entity_name: 'X', action: 'deleted' })],
  ['/daily-job-sheet?date=2026-11-12&job=j1', '/clients/c1', ''], 'each entry opens its record (not a deleted one)')
const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq([/logEdit\('client'/.test(ctx), /logEdit\('employee'/.test(ctx), /logEdit\('booking'/.test(ctx), /logEdit\('invoice'/.test(ctx), /logAudit\('created', 'daily_job', row\.id/.test(ctx), /logAudit\('created', 'expense'/.test(ctx), /logAudit\('deleted', 'day'/.test(ctx)],
  [true, true, true, true, true, true, true], 'client, employee, booking, invoice edits, new jobs, expenses and whole-day deletes are logged')
eq(/add column if not exists changes jsonb/.test(readFileSync('supabase/migrations/2026-11-12_audit_log_details.sql', 'utf8')), true, 'migration adds screen + changes')

// ── R-OPS-07: Data health ──
eq(jobLink({ id: 'j 1', date: '2026-11-10' }), '/daily-job-sheet?date=2026-11-10&job=j%201', 'a job item opens that job on the Daily Job Sheet')
const rep = (m: string, at: string, extra: Partial<AppErrorReport> = {}): AppErrorReport => ({ at, message: m, url: '/daily-job-sheet/spreadsheet', userAgent: 'x', ...extra })
const groups = groupErrors([
  rep('update daily_jobs not saved yet: row 3f2a1b4c-1111-2222-3333-444455556666 violates check', '2026-11-12T10:00:00Z', { where: 'sync', user: 'a@x' }),
  rep('update daily_jobs not saved yet: row 9a9a9a9a-1111-2222-3333-444455556666 violates check', '2026-11-12T11:00:00Z', { where: 'sync', user: 'b@x' }),
  rep('Cannot read properties of undefined', '2026-11-12T09:00:00Z', { where: 'screen /clients' }),
  rep('ECONNRESET', '2026-11-12T08:00:00Z', { kind: 'server', url: 'POST /api/webhook/fluent-forms' }),
])
eq(groups.map(g => [g.kind, g.count]), [['sync', 2], ['server', 1], ['crash', 1]], 'same error with other ids = one group; data problems first')
eq([groups[0].users, groups[0].last], [['a@x', 'b@x'], '2026-11-12T11:00:00Z'], 'who had it and when last')
eq(/not saved to the database yet/.test(groups[0].impact) && /screen crashed/i.test(groups[2].impact), true, 'what it means for the data, in plain words')
eq([kindOf('screen /x'), kindOf('sync'), kindOf('promise')], ['crash', 'sync', 'error'], 'kind of error')
const server = readFileSync('webhookServer.cjs', 'utf8')
eq([/function logServerError/.test(server), /process\.on\('unhandledRejection'/.test(server), /readErrorLog\(300\)/.test(server), /pendingWrites: Math\.max/.test(server)], [true, true, true, true],
  'the server logs its own errors and keeps the new details')
eq(/reportError\(new Error\(`\$\{entry\.op\} \$\{entry\.table\} not saved yet/.test(readFileSync('src/lib/syncQueue.ts', 'utf8')), true, 'a change the database refused is reported once')

// ── R-OPS-08: Backup ──
eq(oldBackupFiles(['safaeewala-backup-2026-10-12.json', 'safaeewala-backup-2026-10-13.xlsx', 'safaeewala-backup-2026-11-12.json', 'notes.txt'], '2026-11-12'),
  ['safaeewala-backup-2026-10-12.json'], 'only copies older than 30 days are removed from the folder; other files never')
const base = { serverOffsite: false, localReady: true, today: '2026-11-12', yesterday: '2026-11-11' }
eq([
  backupSummary({ ...base, server: 'ok', local: { date: '2026-11-12' } }).level,
  backupSummary({ ...base, server: 'ok', local: { date: '2026-11-01' } }).level,
  backupSummary({ ...base, server: 'ok', serverOffsite: true }).level,
  backupSummary({ ...base, server: 'failed', local: { date: '2026-11-12' } }).level,
  backupSummary({ ...base, server: 'ok', drive: { date: '2026-11-12', error: 'HTTP 500' } }).level,
], ['good', 'partial', 'good', 'bad', 'partial'], 'one answer: good (server + a second copy) / partial (server only) / bad (server stopped)')
const json = JSON.parse(backupJson({ bookings: [], clients: [{ id: 'c' }], employees: [], invoices: [], inventory: [], dailyJobs: [{ id: 'j' }], dailyExpenses: [] }))
eq([json.clients.length, json.dailyJobs.length, typeof json.exported_at], [1, 1, 'string'], 'the daily JSON has the Restore shape')
const settings = readFileSync('src/pages/Settings.tsx', 'utf8')
eq([/<BackupOverview/.test(settings), /Header Hero Banner/.test(settings), /<details className="group/.test(settings), /<DailyLocalBackup \/>/.test(readFileSync('src/components/layout/Layout.tsx', 'utf8'))],
  [true, false, true, true], 'Backup tab: status first, the old banner gone, Drive / server settings folded under Advanced; daily copy runs in the app')
