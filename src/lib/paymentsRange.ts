import { todayDubai, addDays } from '@/lib/dubaiTime'

/**
 * R-FIN-21: the Payments screen has one date filter, under the header. It sets the period of the money cards and of
 * the Outstanding / Recovered / Cash Book lists (they had a second filter of their own). Dubai dates.
 */
export type PaymentsRangePreset =
  | 'today' | '7days' | '14days' | '30days' | 'this_month' | 'last_month'
  | '3months' | '6months' | '12months' | 'this_year' | 'last_year' | 'all_time' | 'custom'

export interface PaymentsRange {
  preset: PaymentsRangePreset
  start: string // YYYY-MM-DD, '' = no lower limit
  end: string   // YYYY-MM-DD, '' = no upper limit
  label: string
  sub: string
  isAllTime: boolean
}

/** Shown as pills */
export const PAYMENTS_QUICK_PRESETS: { id: PaymentsRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: '7 Days' },
  { id: '14days', label: '14 Days' },
  { id: '30days', label: '30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
]
/** In the "More" list */
export const PAYMENTS_MORE_PRESETS: { id: PaymentsRangePreset; label: string }[] = [
  { id: '3months', label: 'Last 3 Months' },
  { id: '6months', label: 'Last 6 Months' },
  { id: '12months', label: 'Last 12 Months' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'all_time', label: 'All Time' },
  { id: 'custom', label: 'Custom Range…' },
]
const ALL = [...PAYMENTS_QUICK_PRESETS, ...PAYMENTS_MORE_PRESETS].map(p => p.id)

/** Old links: ?period=this | last | 3 | 12 (R-FIN-18) */
const OLD_PERIOD: Record<string, PaymentsRangePreset> = { this: 'this_month', last: 'last_month', '3': '3months', '12': '12months' }
export function presetFromParams(range: string | null, oldPeriod: string | null): PaymentsRangePreset {
  if (range && (ALL as string[]).includes(range)) return range as PaymentsRangePreset
  if (oldPeriod && OLD_PERIOD[oldPeriod]) return OLD_PERIOD[oldPeriod]
  return 'this_month'
}

const fmt = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const monthStart = (d: string) => `${d.slice(0, 7)}-01`
const monthEnd = (d: string) => {
  const [y, m] = d.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${d.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

export function resolvePaymentsRange(preset: PaymentsRangePreset, from = '', to = '', today = todayDubai()): PaymentsRange {
  const mk = (start: string, end: string, label: string): PaymentsRange =>
    ({ preset, start, end, label, sub: start && end ? (start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`) : '', isAllTime: false })
  const year = today.slice(0, 4)
  switch (preset) {
    case 'today': return mk(today, today, 'Today')
    case '7days': return mk(addDays(today, -6), today, 'Last 7 Days')
    case '14days': return mk(addDays(today, -13), today, 'Last 14 Days')
    case '30days': return mk(addDays(today, -29), today, 'Last 30 Days')
    case 'last_month': { const prev = addDays(monthStart(today), -1); return mk(monthStart(prev), monthEnd(prev), 'Last Month') }
    case '3months': return mk(addDays(today, -89), today, 'Last 3 Months')
    case '6months': return mk(addDays(today, -179), today, 'Last 6 Months')
    case '12months': return mk(addDays(today, -364), today, 'Last 12 Months')
    case 'this_year': return mk(`${year}-01-01`, today, `This Year (${year})`)
    case 'last_year': { const y = String(Number(year) - 1); return mk(`${y}-01-01`, `${y}-12-31`, `Last Year (${y})`) }
    case 'all_time': return { preset, start: '', end: '', label: 'All Time', sub: 'Every record', isAllTime: true }
    case 'custom': {
      const [a, b] = from && to && from > to ? [to, from] : [from, to]
      return { ...mk(a, b, 'Custom Range'), sub: a && b ? `${fmt(a)} – ${fmt(b)}` : a ? `From ${fmt(a)}` : b ? `Until ${fmt(b)}` : 'Pick the from and to dates' }
    }
    default: return mk(monthStart(today), today, 'This Month')
  }
}

export const inPaymentsRange = (r: Pick<PaymentsRange, 'start' | 'end' | 'isAllTime'>, date: string | undefined | null) => {
  if (r.isAllTime) return true
  if (!date) return false
  const d = String(date).slice(0, 10)
  return !(r.start && d < r.start) && !(r.end && d > r.end)
}
