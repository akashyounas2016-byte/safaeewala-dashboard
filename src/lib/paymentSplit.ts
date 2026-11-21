import type { DailyJob } from '@/types'

/**
 * R-PAY-07: one job paid in more than one way (part Cash, part Online …). The Mode shows "Cash + Online" and
 * `mode_split` keeps each mode's amount; Received is their total. Cash / Online totals read the amounts from here,
 * so a split job is counted in each mode for its own part.
 */
export type ModeSplit = { mode: string; amount: number }[]

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export function cleanModeSplit(lines: { mode?: string; amount?: unknown }[] | null | undefined): ModeSplit {
  const out: ModeSplit = []
  ;(lines || []).forEach(l => {
    const mode = String(l?.mode || '').trim()
    if (!mode) return
    const amount = Math.round(num(l?.amount) * 100) / 100
    const have = out.find(x => x.mode.toLowerCase() === mode.toLowerCase())
    if (have) have.amount += amount
    else out.push({ mode, amount })
  })
  return out
}

/** The Mode text of a split: "Cash + Online" */
export const splitModeLabel = (split: ModeSplit) => split.map(s => s.mode).join(' + ')

/** True when the job is paid in more than one mode */
export const isModeSplit = (job: Pick<DailyJob, 'mode_split'>) => cleanModeSplit(job.mode_split).length > 1

/**
 * The money of a job taken in one mode. A split job gives its own part; any other job gives `amount`
 * (default: its Received) when its Mode is that mode.
 */
export function amountInMode(job: Pick<DailyJob, 'payment_mode' | 'received' | 'mode_split'>, mode: string, amount = num(job.received)): number {
  const m = mode.toLowerCase()
  const split = cleanModeSplit(job.mode_split)
  if (split.length > 1) {
    const total = split.reduce((s, x) => s + x.amount, 0)
    const part = split.filter(x => x.mode.toLowerCase() === m).reduce((s, x) => s + x.amount, 0)
    // a job collected in another amount than the split's total (e.g. jobCollected with later receipts): keep the shares
    return total > 0 && amount !== total ? Math.round((amount * part / total) * 100) / 100 : part
  }
  return String(job.payment_mode || '').toLowerCase() === m ? amount : 0
}

/** The job is (partly) paid in this mode — for the Cash / Online filters */
export function hasMode(job: Pick<DailyJob, 'payment_mode' | 'mode_split'>, mode: string): boolean {
  const m = mode.toLowerCase()
  const split = cleanModeSplit(job.mode_split)
  if (split.length > 1) return split.some(x => x.mode.toLowerCase() === m)
  return String(job.payment_mode || '').toLowerCase() === m
}
