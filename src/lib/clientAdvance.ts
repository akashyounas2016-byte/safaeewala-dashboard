import type { Client, DailyAdvanceItem, DailyJob } from '@/types'
import { safeLocalStorageGet } from '@/lib/storageUtils'
import {
  buildPendingCalcContext, calcClientPendingBalance, calcJobAdjustment, getClientDailyJobsHistory,
  isJobPaidFromAdvance, advanceUsedOf, loadClientAdjustments, loadPendingReceipts, normalizeKey, unallocatedReceipts, type JobAdjustmentRecord,
} from '@/lib/clientDataSync'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'

/**
 * R-FIN-10: client advance balance, one formula for Client Profile, Add Job and auto-deduction.
 *   held   = opening advance (client.advance_amount) + advance payments + Advance widget items
 *            + money paid above a job's charges
 *   used   = jobs settled from the advance + standalone advance deductions
 *   balance = held − used (never below 0)
 */

export const ADVANCE_ITEMS_KEY = 'safaeewala_daily_advance_items'
/** Remark written on a job paid from the client's advance — `isJobPaidFromAdvance` reads it */
export const PAID_FROM_ADVANCE_NOTE = 'Paid from advance'

export function advanceMatchesClient(adv: DailyAdvanceItem, client: Client): boolean {
  if (!adv || !client || !adv.client) return false
  const advRaw = adv.client.trim().toLowerCase()
  const cName = client.full_name?.trim().toLowerCase() || ''
  const cBldg = client.building_name?.trim().toLowerCase() || ''
  const cApt = client.apartment?.trim().toLowerCase() || ''

  if (cName && (advRaw === cName || advRaw.includes(cName) || cName.includes(advRaw))) return true
  if (cBldg && (advRaw === cBldg || advRaw.includes(cBldg))) return true
  if (cApt && cBldg && advRaw.includes(cApt) && advRaw.includes(cBldg)) return true

  const advNorm = normalizeKey(adv.client)
  const nameNorm = normalizeKey(client.full_name)
  const bldgNorm = normalizeKey(client.building_name || '')
  if (advNorm && nameNorm && (advNorm === nameNorm || (nameNorm.length >= 4 && advNorm.includes(nameNorm)))) return true
  if (advNorm && bldgNorm && (advNorm === bldgNorm || (bldgNorm.length >= 4 && advNorm.includes(bldgNorm)))) return true
  if (advNorm === normalizeKey(client.id)) return true

  return false
}

const isClientAdj = (a: JobAdjustmentRecord, client: Client) =>
  a.client_id === client.id || (!!a.client_name && a.client_name.toLowerCase().trim() === client.full_name.toLowerCase().trim())

export function calcClientAdvanceBalance(
  client: Client,
  dailyJobs: DailyJob[],
  adjustments: JobAdjustmentRecord[] = loadClientAdjustments(),
  advanceItems: DailyAdvanceItem[] = safeLocalStorageGet<DailyAdvanceItem[]>(ADVANCE_ITEMS_KEY, []),
): number {
  const own = adjustments.filter(a => isClientAdj(a, client))
  const ctx = buildPendingCalcContext(own, [])
  let held = cleanNum(client.advance_amount)
  held += own.filter(a => a.type === 'advance').reduce((s, a) => s + cleanNum(a.amount), 0)
  held += (Array.isArray(advanceItems) ? advanceItems : []).filter(i => advanceMatchesClient(i, client)).reduce((s, i) => s + cleanNum(i.advance), 0)
  held += unallocatedReceipts(client) // R-FIN-12: Pending Received money not used on any due
  let used = own.filter(a => !a.reference_job_id && a.type === 'advance_deduction').reduce((s, a) => s + cleanNum(a.amount), 0)

  getClientDailyJobsHistory(client, dailyJobs).forEach(job => {
    const charges = cleanNum(job.charges)
    const linkedDeduct = own.filter(a => a.reference_job_id === job.id && a.type === 'advance_deduction').reduce((s, a) => s + cleanNum(a.amount), 0)
    const deducted = linkedDeduct > 0 || isJobPaidFromAdvance(job)
    if (deducted) { used += linkedDeduct > 0 ? linkedDeduct : advanceUsedOf(job); if (linkedDeduct > 0 || advanceUsedOf(job) >= charges) return } // R-FIN-11: a part payment keeps counting below
    const effectiveDue = Math.max(0, charges - calcJobAdjustment(job, ctx.adjustments.get(job.id)))
    const received = cleanNum(job.received)
    if (received > effectiveDue) held += received - effectiveDue
  })
  return Math.max(0, Math.round((held - used) * 100) / 100)
}

export interface ClientMoneyStatus {
  advance: number
  pending: number
}

/** UX-135: what the Add Job client list shows — advance held and amount still pending */
export function clientMoneyStatus(client: Client, dailyJobs: DailyJob[]): ClientMoneyStatus {
  return {
    advance: calcClientAdvanceBalance(client, dailyJobs),
    pending: Math.round(calcClientPendingBalance(client, dailyJobs, loadPendingReceipts()) * 100) / 100,
  }
}

/**
 * R-FIN-10: a new job for a client who has enough advance is paid from it automatically, so the
 * cleaner does not ask for money on site. Only when nothing was received on the job and the job is
 * not a monthly-contract visit. Returns the remark to store, or null when the advance does not cover it.
 */
export function autoAdvanceRemark(job: Pick<DailyJob, 'charges' | 'received' | 'payment_mode' | 'remarks'>, advanceBalance: number): string | null {
  const charges = cleanNum(job.charges)
  const due = charges - cleanNum(job.received)
  if (charges <= 0 || due <= 0 || advanceBalance <= 0) return null
  if (String(job.payment_mode).toLowerCase() === 'monthly') return null
  if (isJobPaidFromAdvance(job as DailyJob)) return null
  // R-FIN-11: the advance pays what it can — all of what is due, or the part it covers ("Paid from advance AED 150")
  const used = Math.round(Math.min(due, advanceBalance) * 100) / 100
  const note = used >= charges ? PAID_FROM_ADVANCE_NOTE : `${PAID_FROM_ADVANCE_NOTE} AED ${used}`
  const r = (job.remarks || '').trim()
  return r ? `${r} · ${note}` : note
}
