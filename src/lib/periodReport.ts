import type { Client, DailyExpense, DailyJob } from '@/types'
import { addDays } from '@/lib/dubaiTime'
import { isBogusJob, calcJobPending, buildPendingCalcContext } from '@/lib/clientDataSync'

/**
 * R-OPS-13: Overview → Reports. One summary for a chosen period (Today, Yesterday, Last 7 / 30 days):
 * jobs, cleaners, hours, billed, collected, still pending on those jobs, expenses, new clients, website leads
 * and WhatsApp clicks. Shown as cards, copied / sent by WhatsApp as text, or downloaded as a CSV.
 */
export type ReportPeriod = 'today' | 'yesterday' | '7days' | '30days'

export const REPORT_PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'today', label: 'Daily (Today)' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
]

/** First and last Dubai date of a report period */
export function reportRange(period: ReportPeriod, today: string): { from: string; to: string; label: string } {
  switch (period) {
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y, label: 'Yesterday' } }
    case '7days': return { from: addDays(today, -6), to: today, label: 'Last 7 days' }
    case '30days': return { from: addDays(today, -29), to: today, label: 'Last 30 days' }
    default: return { from: today, to: today, label: 'Today' }
  }
}

export interface PeriodReport {
  from: string
  to: string
  label: string
  jobs: number
  cleaners: number
  hours: number
  billed: number
  collected: number
  pending: number
  expenses: number
  newClients: number
  leads?: number
  clicks?: number
  topAreas: { area: string; jobs: number }[]
}

const num = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0

export function buildPeriodReport(input: {
  period: ReportPeriod
  today: string
  dailyJobs: DailyJob[]
  clients: Client[]
  expenses?: DailyExpense[]
  leads?: number
  clicks?: number
}): PeriodReport {
  const { from, to, label } = reportRange(input.period, input.today)
  const jobs = input.dailyJobs.filter(j => !isBogusJob(j) && j.date >= from && j.date <= to)
  const ctx = buildPendingCalcContext()
  const areas = new Map<string, number>()
  jobs.forEach(j => { const a = (j.area || '').trim() || 'No area'; areas.set(a, (areas.get(a) || 0) + 1) })
  return {
    from, to, label,
    jobs: jobs.length,
    cleaners: new Set(jobs.flatMap(j => String(j.staff_name || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))).size,
    hours: Math.round(jobs.reduce((s, j) => s + num(j.duty_hours), 0) * 10) / 10,
    billed: jobs.reduce((s, j) => s + num(j.charges), 0),
    collected: jobs.reduce((s, j) => s + num(j.received), 0),
    pending: jobs.reduce((s, j) => s + calcJobPending(j, ctx), 0),
    expenses: (input.expenses || []).filter(e => e.date >= from && e.date <= to).reduce((s, e) => s + num(e.amount), 0),
    newClients: input.clients.filter(c => c.created_at && c.created_at.slice(0, 10) >= from && c.created_at.slice(0, 10) <= to).length,
    leads: input.leads,
    clicks: input.clicks,
    topAreas: Array.from(areas, ([area, n]) => ({ area, jobs: n })).sort((a, b) => b.jobs - a.jobs || a.area.localeCompare(b.area)).slice(0, 5),
  }
}

const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`

/** WhatsApp-ready text of a report */
export function periodReportText(r: PeriodReport, company = 'Safaeewala'): string {
  return [
    `*${company} — ${r.label.toLowerCase()} report*`,
    r.from === r.to ? r.from : `${r.from} to ${r.to}`,
    '',
    `Jobs: ${r.jobs} (${r.cleaners} cleaners, ${r.hours} h)`,
    `Billed: ${aed(r.billed)}`,
    `Collected on the jobs: ${aed(r.collected)}`,
    `Still pending on these jobs: ${aed(r.pending)}`,
    `Expenses: ${aed(r.expenses)}`,
    `New clients: ${r.newClients}`,
    ...(r.leads !== undefined ? [`Website leads: ${r.leads}`] : []),
    ...(r.clicks !== undefined ? [`WhatsApp clicks: ${r.clicks}`] : []),
    ...(r.topAreas.length ? ['', `Top areas: ${r.topAreas.map(a => `${a.area} ${a.jobs}`).join(', ')}`] : []),
  ].join('\n')
}

/** CSV (Excel opens it) of a report: one line per figure */
export function periodReportCsv(r: PeriodReport): string {
  const rows: [string, string | number][] = [
    ['Period', r.label], ['From', r.from], ['To', r.to],
    ['Jobs', r.jobs], ['Cleaners', r.cleaners], ['Hours', r.hours],
    ['Billed (AED)', r.billed], ['Collected (AED)', r.collected], ['Pending on these jobs (AED)', r.pending],
    ['Expenses (AED)', r.expenses], ['New clients', r.newClients],
    ...(r.leads !== undefined ? [['Website leads', r.leads] as [string, number]] : []),
    ...(r.clicks !== undefined ? [['WhatsApp clicks', r.clicks] as [string, number]] : []),
    ...r.topAreas.map(a => [`Area: ${a.area}`, a.jobs] as [string, number]),
  ]
  const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return rows.map(([k, v]) => `${cell(k)},${cell(v)}`).join('\n')
}
