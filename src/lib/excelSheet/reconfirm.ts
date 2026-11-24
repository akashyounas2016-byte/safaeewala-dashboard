import type { DailyJob } from '@/types'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'

/**
 * R-SHEET-03: Excel Job Sheet → Reconfirmation. The office's own cross-check of the sheet's money:
 *
 *        Charges
 *   Less Rcvd
 *        Pending
 *        Balance   = Charges − Rcvd − Pending
 *   Add  Adv       (money taken beyond the charges)
 *        Balance   = Balance + Adv   → 0 when the sheet adds up
 *
 * When the last Balance is not 0, `gaps` lists the rows that do not add up on their own
 * (charges − received − pending + advance ≠ 0), e.g. a pending that a client advance or a
 * pending adjustment already covers.
 */
export interface ReconfirmRow { job: DailyJob; charges: number; received: number; pending: number; advance: number; gap: number }
export interface Reconfirmation {
  rows: number
  charges: number
  received: number
  pending: number
  balance: number
  advance: number
  finalBalance: number
  cash: number
  online: number
  gaps: ReconfirmRow[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function buildReconfirmation(
  jobs: DailyJob[],
  rowPending: (j: DailyJob) => number,
  rowAdvance: (j: DailyJob) => number,
): Reconfirmation {
  const filled = jobs.filter(j => j.address || j.start_time || j.end_time || cleanNum(j.charges) || cleanNum(j.received))
  let charges = 0, received = 0, pending = 0, advance = 0, cash = 0, online = 0
  const gaps: ReconfirmRow[] = []
  for (const job of filled) {
    const c = cleanNum(job.charges), rc = cleanNum(job.received), p = rowPending(job), a = rowAdvance(job)
    charges += c; received += rc; pending += p; advance += a
    if (/online|card|bank|transfer/i.test(String(job.payment_mode || ''))) online += rc
    else cash += rc
    const gap = r2(c - rc - p + a)
    if (Math.abs(gap) >= 0.01) gaps.push({ job, charges: c, received: rc, pending: p, advance: a, gap })
  }
  const balance = r2(charges - received - pending)
  return {
    rows: filled.length,
    charges: r2(charges), received: r2(received), pending: r2(pending), balance,
    advance: r2(advance), finalBalance: r2(balance + advance),
    cash: r2(cash), online: r2(online),
    gaps,
  }
}

/** The same figures as text — to paste in WhatsApp */
export function reconfirmationText(r: Reconfirmation, label: string): string {
  const n = (v: number) => v.toLocaleString('en-US')
  return [
    `*Reconfirmation — ${label}*`,
    `Charges: ${n(r.charges)}`,
    `Less Rcvd: ${n(r.received)}`,
    `Pending: ${n(r.pending)}`,
    `Balance: ${n(r.balance)}`,
    `Add Adv: ${n(r.advance)}`,
    `Balance: ${n(r.finalBalance)}${r.finalBalance === 0 ? ' ✓' : ''}`,
  ].join('\n')
}
