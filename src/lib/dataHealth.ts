import type { Client, DailyJob, Employee, Invoice } from '@/types'
import { employeeMatchesStaff, isBogusJob, splitStaffNames, unallocatedReceipts, calcClientPendingBalance, loadPendingReceipts, loadClientAdjustments } from '@/lib/clientDataSync'
import { calcClientAdvanceBalance } from '@/lib/clientAdvance'
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

/** R-OPS-07: the Daily Job Sheet on the job's date with that job opened (?job= opens it for editing) */
export const jobLink = (job: Pick<DailyJob, 'id' | 'date'>) =>
  `/daily-job-sheet?date=${encodeURIComponent(job.date)}&job=${encodeURIComponent(job.id)}`

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
  // R-OPS-07: the link opens the newest job with that name on the Daily Job Sheet (where it is fixed),
  // not the Employees list; the other dates are listed beside it
  const unknownStaff = new Map<string, DailyJob[]>()
  recentJobs.forEach(j => splitStaffNames(j.staff_name || '').forEach(n => {
    if (!employees.some(e => employeeMatchesStaff(e, n))) unknownStaff.set(n, [...(unknownStaff.get(n) || []), j])
  }))
  const unregistered = Array.from(unknownStaff.entries()).sort((a, b) => b[1].length - a[1].length)
    .map(([name, jobs]) => {
      const newest = [...jobs].sort((a, b) => b.date.localeCompare(a.date) || String(b.start_time || '').localeCompare(String(a.start_time || '')))[0]
      const others = Array.from(new Set(jobs.map(j => j.date).filter(d => d !== newest.date))).sort().reverse().slice(0, 3)
      const n = jobs.length
      return {
        label: `${name} · ${newest.date} · ${newest.address || '—'}`,
        detail: `${n} job${n === 1 ? '' : 's'} in the last 60 days${others.length ? ` · also ${others.join(', ')}` : ''} — open the job and pick a registered cleaner, or add ${name} on Employees`,
        link: jobLink(newest),
      }
    })

  // 4. Job rows with warnings (times, amounts, monthly cash, duplicates) in the last 60 days
  const checks = buildRowChecks(recentJobs, employees)
  const byId = new Map(recentJobs.map(j => [j.id, j]))
  const rowWarnings = Array.from(checks.entries())
    .map(([id, msgs]) => ({ job: byId.get(id)!, msgs: msgs.filter(m => !m.startsWith('Not a registered')) }))
    .filter(x => x.job && x.msgs.length > 0)
    .sort((a, b) => b.job.date.localeCompare(a.job.date))
    .map(({ job, msgs }) => ({ label: `${job.date} · ${job.staff_name} · ${job.address || '—'}`, detail: msgs.join('; '), link: jobLink(job) })) // R-OPS-07

  // 5. Invoices that point to job rows which no longer exist
  const jobIds = new Set(dailyJobs.map(j => j.id))
  const brokenInvoices = invoices
    .map(inv => ({ inv, missing: (inv.job_ids || []).filter(id => !jobIds.has(id)).length }))
    .filter(x => x.missing > 0)
    .map(({ inv, missing }) => ({ label: `${inv.invoice_number} · ${inv.client_name}`, detail: `${missing} linked visit${missing === 1 ? '' : 's'} deleted`, link: '/invoices' }))

  // 6. Clients without any phone number
  const noPhone = clients.filter(c => !normalizePhone(c.phone) && !normalizePhone(c.whatsapp))
    .map(c => ({ label: c.full_name || '(no name)', detail: 'no phone / WhatsApp', link: `/clients/${c.id}` }))

  // R-OPS-11 (audit 2026-11-22): the money checks of the CRM audit, every day
  // 7. Jobs with a time and an address but AED 0 charges and nothing received (not monthly / team member rows)
  const zeroCharge = recentJobs.filter(j => !Number(j.charges) && !Number(j.received) && j.payment_mode !== 'Monthly' && j.payment_mode !== 'Above' && j.address && j.start_time && !/paid\s*from\s*adv/i.test(j.remarks || ''))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(j => ({ label: `${j.date} · ${j.staff_name} · ${j.address}`, detail: 'no charges and nothing received — enter the charges (or the rate in the client schedule)', link: jobLink(j) }))
  // 8. Bi-Weekly clients whose schedule has a day without Charges / Hr (their visits come at AED 0)
  const noRate = clients.filter(c => c.service_mode === 'biweekly' && c.contract_active !== false && (c.biweekly_plan?.days || []).some(d => !(Number(c.biweekly_plan?.day_schedules?.[d]?.rate) > 0)))
    .map(c => ({ label: c.full_name, detail: `no Charges / Hr on ${(c.biweekly_plan?.days || []).filter(d => !(Number(c.biweekly_plan?.day_schedules?.[d]?.rate) > 0)).join(', ')} — Edit client → schedule`, link: `/clients/${c.id}` }))
  // 9. Pending Received with nothing pending (kept as advance, R-FIN-12) and 10. clients with both pending and advance
  const receipts = loadPendingReceipts()
  const adjustments = loadClientAdjustments()
  const freeReceipts = clients.map(c => ({ c, v: unallocatedReceipts(c, receipts) })).filter(x => x.v > 0)
    .map(({ c, v }) => ({ label: c.full_name, detail: `AED ${v} collected with nothing pending — kept as advance; delete it in Pending Received if it was not a payment`, link: `/clients/${c.id}` }))
  const both = clients.map(c => ({ c, pending: calcClientPendingBalance(c, dailyJobs, receipts, adjustments), advance: calcClientAdvanceBalance(c, dailyJobs, adjustments) }))
    .filter(x => x.pending > 0 && x.advance > 0)
    .map(({ c, pending, advance }) => ({ label: c.full_name, detail: `pending AED ${Math.round(pending)} and advance AED ${Math.round(advance)} — settle one against the other (Client Profile → Settle)`, link: `/clients/${c.id}` }))

  return [
    { id: 'sync', title: 'Changes not saved to the cloud', severity: 'high', help: 'Saved in this browser only. They upload automatically when the connection works.', items: unsyncedChanges > 0 ? [{ label: `${unsyncedChanges} change${unsyncedChanges === 1 ? '' : 's'} waiting` }] : [] },
    { id: 'dup-emp', title: 'Possible duplicate employees', severity: 'high', help: 'Same Emirates ID, passport or phone on two records — keep one.', items: dupEmp },
    { id: 'dup-client', title: 'Possible duplicate clients', severity: 'medium', help: 'Same phone number on two client records — balances may be split.', items: dupClients },
    { id: 'unregistered', title: 'Staff on jobs who are not registered', severity: 'medium', help: 'Names on the job sheet with no employee record (attendance and payroll miss them).', items: unregistered },
    { id: 'rows', title: 'Job rows to check (last 60 days)', severity: 'medium', help: 'End before start, received more than charged, monthly visit with cash, duplicate rows.', items: rowWarnings },
    { id: 'invoices', title: 'Invoices linked to deleted visits', severity: 'low', help: 'The invoice still lists visits that were deleted from the job sheet.', items: brokenInvoices },
    { id: 'zero-charge', title: 'Jobs with no charges (last 60 days)', severity: 'medium', help: 'Work done but nothing billed or received — the totals are too low.', items: zeroCharge },
    { id: 'no-rate', title: 'Bi-Weekly clients without a rate', severity: 'medium', help: 'Their visits are added at AED 0 until each day has Charges / Hr.', items: noRate },
    { id: 'free-receipts', title: 'Collected with nothing pending', severity: 'low', help: 'Pending Received money that paid no due — counted as the client advance.', items: freeReceipts },
    { id: 'pending-and-advance', title: 'Clients with both pending and advance', severity: 'low', help: 'The advance can pay the pending dues.', items: both },
    { id: 'no-phone', title: 'Clients without a phone number', severity: 'low', help: 'Reminders and WhatsApp cannot reach them.', items: noPhone },
  ]
}
