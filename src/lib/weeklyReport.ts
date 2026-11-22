import type { Client, DailyJob } from '@/types'
import { addDays } from '@/lib/dubaiTime'
import { isBogusJob, calcJobPending, buildPendingCalcContext } from '@/lib/clientDataSync'

/**
 * R-OPS-12 (audit 2026-11-22): the owner's weekly summary as a WhatsApp-ready text — the last 7 days
 * (today included): jobs, billed, collected, still pending now, new clients, website leads and WhatsApp clicks.
 */
export function weeklyReportText(input: {
  dailyJobs: DailyJob[]
  clients: Client[]
  today: string
  leads?: number
  clicks?: number
  company?: string
}): string {
  const from = addDays(input.today, -6)
  const week = input.dailyJobs.filter(j => !isBogusJob(j) && j.date >= from && j.date <= input.today)
  const billed = week.reduce((s, j) => s + (Number(j.charges) || 0), 0)
  const collected = week.reduce((s, j) => s + (Number(j.received) || 0), 0)
  const ctx = buildPendingCalcContext()
  const pendingNow = input.dailyJobs.filter(j => !isBogusJob(j)).reduce((s, j) => s + calcJobPending(j, ctx), 0)
  const newClients = input.clients.filter(c => c.created_at && c.created_at.slice(0, 10) >= from).length
  const cleaners = new Set(week.flatMap(j => String(j.staff_name || '').split(',').map(s => s.trim()).filter(Boolean))).size
  const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`
  return [
    `*${input.company || 'Safaeewala'} — weekly report*`,
    `${from} to ${input.today}`,
    '',
    `Jobs: ${week.length} (${cleaners} cleaners)`,
    `Billed: ${aed(billed)}`,
    `Collected on the jobs: ${aed(collected)}`,
    `Pending now (all dates): ${aed(pendingNow)}`,
    `New clients: ${newClients}`,
    ...(input.leads !== undefined ? [`Website leads: ${input.leads}`] : []),
    ...(input.clicks !== undefined ? [`WhatsApp clicks: ${input.clicks}`] : []),
  ].join('\n')
}
