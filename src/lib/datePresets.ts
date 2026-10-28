/**
 * One set of date presets for the finance screens (UX-05), so Pending, Payments, Expenses and
 * Invoices offer the same choices with the same meaning.
 */
export type StandardPreset =
  | 'all' | 'today' | '7days' | '14days' | '28days' | '30days'
  | 'this_month' | 'last_month' | '3months' | '6months' | 'this_year' | 'last_year' | 'custom'

export const STANDARD_PRESETS: { id: StandardPreset; label: string }[] = [
  { id: 'today',      label: 'Today' },
  { id: '7days',      label: 'Last 7 Days' },
  { id: '30days',     label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: '3months',    label: 'Last 3 Months' },
  { id: 'this_year',  label: 'This Year' },
  { id: 'all',        label: 'All Time' },
  { id: 'custom',     label: 'Custom' },
]

/** Default period every finance screen opens with */
export const DEFAULT_FINANCE_PRESET: StandardPreset = 'this_month'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface PresetRange { start: string; end: string; label: string; isAllTime: boolean }

export function rangeForPreset(preset: StandardPreset, custom?: { start?: string; end?: string }, now = new Date()): PresetRange {
  const today = iso(now)
  const daysBack = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - (n - 1)); return iso(d) }
  const label = STANDARD_PRESETS.find(p => p.id === preset)?.label || preset
  const y = now.getFullYear(), m = now.getMonth()
  switch (preset) {
    case 'today':      return { start: today, end: today, label, isAllTime: false }
    case '7days':      return { start: daysBack(7), end: today, label, isAllTime: false }
    case '14days':     return { start: daysBack(14), end: today, label: 'Last 14 Days', isAllTime: false }
    case '28days':     return { start: daysBack(28), end: today, label: 'Last 28 Days', isAllTime: false }
    case '30days':     return { start: daysBack(30), end: today, label, isAllTime: false }
    case 'this_month': return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)), label, isAllTime: false }
    case 'last_month': return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)), label, isAllTime: false }
    case '3months':    return { start: iso(new Date(y, m - 2, 1)), end: today, label, isAllTime: false }
    case '6months':    return { start: iso(new Date(y, m - 5, 1)), end: today, label: 'Last 6 Months', isAllTime: false }
    case 'this_year':  return { start: `${y}-01-01`, end: `${y}-12-31`, label, isAllTime: false }
    case 'last_year':  return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: 'Last Year', isAllTime: false }
    case 'custom':
      return custom?.start && custom?.end
        ? { start: custom.start, end: custom.end, label: `${custom.start} to ${custom.end}`, isAllTime: false }
        : { start: '', end: '', label: 'Custom Range', isAllTime: true }
    default:           return { start: '', end: '', label: 'All Time', isAllTime: true }
  }
}

export const inRange = (r: PresetRange, date?: string) => {
  if (r.isAllTime) return true
  if (!date) return false
  const d = date.split('T')[0]
  return (!r.start || d >= r.start) && (!r.end || d <= r.end)
}
