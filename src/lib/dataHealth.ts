import type { Client, DailyJob, Employee, Invoice } from '@/types'
import { employeeMatchesStaff, isBogusJob, splitStaffNames } from '@/lib/clientDataSync'
import { buildRowChecks } from '@/lib/jobChecks'
import { normalizeEmiratesId, normalizePhone } from '@/lib/validation'
import { addDays } from '@/lib/dubaiTime'

/**
 * Data health checks (AUD-67): one place that lists what needs cleaning. Read-only — every
 * item links to the screen where it is fixed.
 */
export interface HealthItem { label: string; detail?: string; link?: string }
export interface HealthCheck {
  id: string
  title: string
  help: string
  severity: 'high' | 'medium' | 'low'
  items: HealthItem[]
}

/** Groups of records that share the same key (2+ records) */
function groups<T>(rows: T[], key: (r: T) => string): T[][] {
  const map = new Map<string, T[]>()
  rows.forEach(r => {
    const k = key(r)
    if (!k) return
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  })
  return Array.from(map.values()).filter(g => g.length > 1)
}

export function runDataHealth(input: {
  clients: Client[]
  employees: Employee[]
  dailyJobs: DailyJob[]
  invoices: Invoice[]
  today: string
  unsyncedChanges: number
}): HealthCheck[] {
  const { clients, employees, dailyJobs, invoices, today, unsyncedChanges } = input
  const since = addDays(today, -60)
  const recentJobs = dailyJobs.filter(j => j.date && j.date >= since && j.date <= today && !isBogusJob(j))

  // 1. Duplicate clients by phone
  const dupClients = groups(clients, c => {
    const p = normalizePhone(c.phone)
    return p.length >= 9 ? p : ''
  }).map(g => ({ label: g.map(c => c.full_name).join(' · '), detail: `same phone ${g[0].phone}`, link: `/clients/${g[0].id}` }))

  // 2. Duplicate employees by Emirates ID / passport / phone
  const dupEmp = [
    ...groups(employees, e => { const d = normalizeEmiratesId(e.emirates_id); return d.length >= 10 ? `eid:${d}` : '' }).map(g => ({ g, why: 'same Emirates ID' })),
    ...groups(employees, e => { const p = String(e.passport_number || '').replace(/\s/g, '').toLowerCase(); return p.length >= 5 ? `pp:${p}` : '' }).map(g => ({ g, why: 'same passport' })),
    ...groups(employees, e => { const p = normalizePhone(e.phone); return p.length >= 9 ? `ph:${p}` : '' }).map(g => ({ g, why: 'same phone' })),
  ].map(({ g, why }) => ({ label: g.map(e => e.full_name).join(' · '), detail: why, link: `/employees/${g[0].id}` }))

  // 3. Staff names on recent jobs that are not registered employees
  const unknownStaff = new Map<string, number>()
  recentJobs.forEach(j => splitStaffNames(j.staff_name || '').forEach(n => {
    if (!employees.some(e => employeeMatchesStaff(e, n))) unknownStaff.set(n, (unknownStaff.get(n) || 0) + 1)
  }))
  const unregistered = Array.from(unknownStaff.entries()).sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ label: name, detail: `${n} job${n === 1 ? '' : 's'} in the last 60 days`, link: '/employees' }))

  // 4. Job rows with warnings (times, amounts, monthly cash, duplicates) in the last 60 days
  const checks = buildRowChecks(recentJobs, employees)
  const byId = new Map(recentJobs.map(j => [j.id, j]))
  const rowWarnings = Array.from(checks.entries())
    .map(([id, msgs]) => ({ job: byId.get(id)!, msgs: msgs.filter(m => !m.startsWith('Not a registered')) }))
    .filter(x => x.job && x.msgs.length > 0)
    .sort((a, b) => b.job.date.localeCompare(a.job.date))
    .map(({ job, msgs }) => ({ label: `${job.date} · ${job.staff_name} · ${job.address || '—'}`, detail: msgs.join('; '), link: `/daily-job-sheet?date=${job.date}` }))

  // 5. Invoices that point to job rows which no longer exist
  const jobIds = new Set(dailyJobs.map(j => j.id))
  const brokenInvoices = invoices
    .map(inv => ({ inv, missing: (inv.job_ids || []).filter(id => !jobIds.has(id)).length }))
    .filter(x => x.missing > 0)
    .map(({ inv, missing }) => ({ label: `${inv.invoice_number} · ${inv.client_name}`, detail: `${missing} linked visit${missing === 1 ? '' : 's'} deleted`, link: '/invoices' }))

  // 6. Clients without any phone number
  const noPhone = clients.filter(c => !normalizePhone(c.phone) && !normalizePhone(c.whatsapp))
    .map(c => ({ label: c.full_name || '(no name)', detail: 'no phone / WhatsApp', link: `/clients/${c.id}` }))

  return [
    { id: 'sync', title: 'Changes not saved to the cloud', severity: 'high', help: 'Saved in this browser only. They upload automatically when the connection works.', items: unsyncedChanges > 0 ? [{ label: `${unsyncedChanges} change${unsyncedChanges === 1 ? '' : 's'} waiting` }] : [] },
    { id: 'dup-emp', title: 'Possible duplicate employees', severity: 'high', help: 'Same Emirates ID, passport or phone on two records — keep one.', items: dupEmp },
    { id: 'dup-client', title: 'Possible duplicate clients', severity: 'medium', help: 'Same phone number on two client records — balances may be split.', items: dupClients },
    { id: 'unregistered', title: 'Staff on jobs who are not registered', severity: 'medium', help: 'Names on the job sheet with no employee record (attendance and payroll miss them).', items: unregistered },
    { id: 'rows', title: 'Job rows to check (last 60 days)', severity: 'medium', help: 'End before start, received more than charged, monthly visit with cash, duplicate rows.', items: rowWarnings },
    { id: 'invoices', title: 'Invoices linked to deleted visits', severity: 'low', help: 'The invoice still lists visits that were deleted from the job sheet.', items: brokenInvoices },
    { id: 'no-phone', title: 'Clients without a phone number', severity: 'low', help: 'Reminders and WhatsApp cannot reach them.', items: noPhone },
  ]
}
