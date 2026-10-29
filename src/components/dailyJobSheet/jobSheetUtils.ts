import type { PaymentMode, MaterialType } from '@/types'
import { todayDubai } from '@/lib/dubaiTime'

export const MATERIALS: MaterialType[] = ['No', 'Yes', 'Sofa', 'Ladder', 'Sofa Seat']
export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Online', 'Pending', 'Monthly', 'Above']
export const EXPENSE_CATEGORIES = ['Fuel', 'Parking', 'Toll', 'Vehicle maintenance', 'Supplies', 'Other']
export const COMMON_SERVICES = ['House', 'Deep', 'Sofa', 'Window', 'Office', 'Villa', 'Apartment', 'Carpet', 'Move-in', 'Move-out', 'Other']

export function cleanNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'monthly' || str.toLowerCase() === 'n/a') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function parseTimeToMinutes(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') {
    if (isNaN(val)) return null
    const frac = val >= 1 ? val - Math.floor(val) : val
    return Math.round(frac * 24 * 60) % (24 * 60)
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    return val.getHours() * 60 + val.getMinutes()
  }
  const str = String(val).trim()
  if (!str || str === '—' || str === '-') return null

  // 12-hour format e.g. "08:30 AM", "4:00 PM", "12:00pm"
  const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10)
    const mm = parseInt(ampmMatch[2], 10)
    const mer = ampmMatch[3].toUpperCase()
    if (mer === 'PM' && hh < 12) hh += 12
    if (mer === 'AM' && hh === 12) hh = 0
    return (hh * 60 + mm) % (24 * 60)
  }

  // 24-hour format e.g. "08:30", "16:00", "20:15"
  const timeMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/)
  if (timeMatch) {
    const hh = parseInt(timeMatch[1], 10)
    const mm = parseInt(timeMatch[2], 10)
    return (hh * 60 + mm) % (24 * 60)
  }

  const parsed = new Date(str.includes('T') ? str : '2000-01-01T' + str)
  if (!isNaN(parsed.getTime())) {
    return (parsed.getHours() * 60 + parsed.getMinutes()) % (24 * 60)
  }

  return null
}

export function formatTime24h(val: unknown): string {
  const mins = parseTimeToMinutes(val)
  if (mins === null) return ''
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Universal 12-Hour AM/PM Time Formatter (e.g. "09:00 AM", "04:30 PM", "08:00 PM")
 */
export function formatTime12h(val: unknown): string {
  const mins = parseTimeToMinutes(val)
  if (mins === null) return '—'
  let hh = Math.floor(mins / 60)
  const mm = String(mins % 60).padStart(2, '0')
  const mer = hh >= 12 ? 'PM' : 'AM'
  hh = hh % 12 || 12
  return `${String(hh).padStart(2, '0')}:${mm} ${mer}`
}

export function formatTimeOnly(val: unknown): string {
  return formatTime12h(val)
}

export function calcHours(start: string, end: string): number {
  const startMins = parseTimeToMinutes(start)
  const endMins   = parseTimeToMinutes(end)
  if (startMins === null || endMins === null) return 0
  let diff = endMins - startMins
  if (diff < 0) diff += 24 * 60
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

/**
 * R-OT-01: Two-scenario Overtime (OT) Calculation
 * Scenario 1: Work performed after 8:00 PM (20:00) is always OT regardless of basic hours.
 * Scenario 2: Work performed before 8:00 PM exceeding standard basic duty hours (8 hours / 480 mins) is also OT.
 * Combined: Excess pre-8 PM hours + post-8 PM hours = Total OT.
 */
export function calcOTHours(start: string, end: string): number {
  const startMins = parseTimeToMinutes(start)
  let endMins     = parseTimeToMinutes(end)
  if (startMins === null || endMins === null) return 0
  // Shift crossing midnight (e.g. 19:00 → 01:00) ends on the next day
  if (endMins < startMins) endMins += 24 * 60

  const OT_CUTOFF = 20 * 60 // 8:00 PM (1200 mins)
  const BASIC_LIMIT_MINS = 8 * 60 // 8 basic hours (480 mins)

  // Scenario 1: Hours worked after 8:00 PM are unconditionally Overtime
  const post8PmMins = endMins > OT_CUTOFF
    ? endMins - Math.max(startMins, OT_CUTOFF)
    : 0

  // Scenario 2: Hours worked before 8:00 PM exceeding basic 8 hours
  const pre8PmEnd = Math.min(endMins, OT_CUTOFF)
  const pre8PmStart = Math.min(startMins, OT_CUTOFF)
  const pre8PmMins = Math.max(0, pre8PmEnd - pre8PmStart)
  const pre8PmExcessMins = pre8PmMins > BASIC_LIMIT_MINS
    ? pre8PmMins - BASIC_LIMIT_MINS
    : 0

  const totalOtMins = post8PmMins + pre8PmExcessMins
  return totalOtMins > 0 ? Math.round((totalOtMins / 60) * 10) / 10 : 0
}

export function fmtDate(d: string) {
  if (!d) return '—'
  const parsed = new Date(d.includes('T') ? d : d + 'T00:00:00')
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Safely adds or subtracts days from a YYYY-MM-DD string without timezone shifts or day skipping.
 */
export function addDaysToYMD(ymdStr: string, deltaDays: number): string {
  if (!ymdStr || !/^\d{4}-\d{2}-\d{2}$/.test(ymdStr)) {
    ymdStr = todayDubai()
  }
  const [y, m, d] = ymdStr.split('-').map(Number)
  const utcDate = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const year = utcDate.getUTCFullYear()
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface StaffPalette {
  name: string
  rowBg: string
  borderLeft: string
  nameColor: string
  avatarBg: string
  badgeBg: string
}

export const STAFF_COLOR_PALETTES: StaffPalette[] = [
  {
    name: 'Emerald',
    rowBg: 'bg-emerald-50/70 hover:bg-emerald-100/70',
    borderLeft: 'border-l-[5px] border-l-emerald-500',
    nameColor: 'text-emerald-950 font-bold',
    avatarBg: 'bg-emerald-600 text-white',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    name: 'Sky Blue',
    rowBg: 'bg-sky-50/70 hover:bg-sky-100/70',
    borderLeft: 'border-l-[5px] border-l-sky-500',
    nameColor: 'text-sky-950 font-bold',
    avatarBg: 'bg-sky-600 text-white',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  {
    name: 'Violet',
    rowBg: 'bg-purple-50/70 hover:bg-purple-100/70',
    borderLeft: 'border-l-[5px] border-l-purple-500',
    nameColor: 'text-purple-950 font-bold',
    avatarBg: 'bg-purple-600 text-white',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    name: 'Amber',
    rowBg: 'bg-amber-50/70 hover:bg-amber-100/70',
    borderLeft: 'border-l-[5px] border-l-amber-500',
    nameColor: 'text-amber-950 font-bold',
    avatarBg: 'bg-amber-600 text-white',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    name: 'Teal',
    rowBg: 'bg-teal-50/70 hover:bg-teal-100/70',
    borderLeft: 'border-l-[5px] border-l-teal-500',
    nameColor: 'text-teal-950 font-bold',
    avatarBg: 'bg-teal-600 text-white',
    badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  {
    name: 'Indigo',
    rowBg: 'bg-indigo-50/70 hover:bg-indigo-100/70',
    borderLeft: 'border-l-[5px] border-l-indigo-500',
    nameColor: 'text-indigo-950 font-bold',
    avatarBg: 'bg-indigo-600 text-white',
    badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  {
    name: 'Rose',
    rowBg: 'bg-rose-50/70 hover:bg-rose-100/70',
    borderLeft: 'border-l-[5px] border-l-rose-500',
    nameColor: 'text-rose-950 font-bold',
    avatarBg: 'bg-rose-600 text-white',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  {
    name: 'Orange',
    rowBg: 'bg-orange-50/70 hover:bg-orange-100/70',
    borderLeft: 'border-l-[5px] border-l-orange-500',
    nameColor: 'text-orange-950 font-bold',
    avatarBg: 'bg-orange-600 text-white',
    badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
  },
]

export interface ColumnConfig {
  id: string
  label: string
}

export const ALL_COLUMNS: ColumnConfig[] = [
  { id: 'staff',        label: 'Staff' },
  { id: 'start_time',   label: 'Start Time' },
  { id: 'end_time',     label: 'End Time' },
  { id: 'address',      label: 'Address' },
  { id: 'area',         label: 'Location / Zone' },
  { id: 'charges',      label: 'Charges' },
  { id: 'received',     label: 'Received' },
  { id: 'pending',      label: 'Pending' },
  { id: 'duty_hours',   label: 'Duty Hrs' },
  { id: 'ot_hours',     label: 'OT Hrs' },
  { id: 'material',     label: 'Material' },
  { id: 'payment_mode', label: 'Payment Mode' },
  { id: 'remarks',      label: 'Remarks' },
  { id: 'service',      label: 'Service' },
  { id: 'actions',      label: 'Actions' },
]

export const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  staff:        true,
  start_time:   true,
  end_time:     true,
  address:      true,
  area:         true,
  charges:      true,
  received:     true,
  pending:      true,
  duty_hours:   true,
  ot_hours:     true,
  material:     true,
  payment_mode: true,
  remarks:      true,
  service:      true,
  actions:      true,
}

export interface RowColorPreset {
  id: string
  label: string
  circleColor: string
  rowBg: string
  borderLeft: string
}

export const ROW_COLOR_PRESETS: RowColorPreset[] = [
  { id: 'default', label: 'Default', circleColor: '#f1f5f9', rowBg: '', borderLeft: '' },
  { id: 'emerald', label: 'Soft Emerald', circleColor: '#a7f3d0', rowBg: 'bg-emerald-50/70 hover:bg-emerald-100/70', borderLeft: 'border-l-[5px] border-l-emerald-500' },
  { id: 'sky', label: 'Soft Sky', circleColor: '#bae6fd', rowBg: 'bg-sky-50/70 hover:bg-sky-100/70', borderLeft: 'border-l-[5px] border-l-sky-500' },
  { id: 'amber', label: 'Soft Amber', circleColor: '#fde68a', rowBg: 'bg-amber-50/70 hover:bg-amber-100/70', borderLeft: 'border-l-[5px] border-l-amber-500' },
  { id: 'purple', label: 'Soft Violet', circleColor: '#ddd6fe', rowBg: 'bg-purple-50/70 hover:bg-purple-100/70', borderLeft: 'border-l-[5px] border-l-purple-500' },
  { id: 'rose', label: 'Soft Rose', circleColor: '#fecdd3', rowBg: 'bg-rose-50/70 hover:bg-rose-100/70', borderLeft: 'border-l-[5px] border-l-rose-500' },
  { id: 'teal', label: 'Soft Teal', circleColor: '#99f6e4', rowBg: 'bg-teal-50/70 hover:bg-teal-100/70', borderLeft: 'border-l-[5px] border-l-teal-500' },
  { id: 'blue', label: 'Soft Blue', circleColor: '#bfdbfe', rowBg: 'bg-blue-50/70 hover:bg-blue-100/70', borderLeft: 'border-l-[5px] border-l-blue-500' },
  { id: 'indigo', label: 'Soft Indigo', circleColor: '#c7d2fe', rowBg: 'bg-indigo-50/70 hover:bg-indigo-100/70', borderLeft: 'border-l-[5px] border-l-indigo-500' },
  { id: 'orange', label: 'Soft Orange', circleColor: '#fed7aa', rowBg: 'bg-orange-50/70 hover:bg-orange-100/70', borderLeft: 'border-l-[5px] border-l-orange-500' },
  { id: 'lime', label: 'Soft Lime', circleColor: '#d9f99d', rowBg: 'bg-lime-50/70 hover:bg-lime-100/70', borderLeft: 'border-l-[5px] border-l-lime-500' },
  { id: 'cyan', label: 'Soft Cyan', circleColor: '#a5f3fc', rowBg: 'bg-cyan-50/70 hover:bg-cyan-100/70', borderLeft: 'border-l-[5px] border-l-cyan-500' },
  { id: 'fuchsia', label: 'Soft Fuchsia', circleColor: '#f5d0fe', rowBg: 'bg-fuchsia-50/70 hover:bg-fuchsia-100/70', borderLeft: 'border-l-[5px] border-l-fuchsia-500' },
  { id: 'pink', label: 'Soft Pink', circleColor: '#fbcfe8', rowBg: 'bg-pink-50/70 hover:bg-pink-100/70', borderLeft: 'border-l-[5px] border-l-pink-500' },
  { id: 'yellow', label: 'Soft Yellow', circleColor: '#fef08a', rowBg: 'bg-yellow-50/70 hover:bg-yellow-100/70', borderLeft: 'border-l-[5px] border-l-yellow-500' },
  { id: 'violet', label: 'Soft Lavender', circleColor: '#e9d5ff', rowBg: 'bg-purple-100/60 hover:bg-purple-200/60', borderLeft: 'border-l-[5px] border-l-purple-600' },
  { id: 'stone', label: 'Warm Stone', circleColor: '#e7e5e4', rowBg: 'bg-stone-50/80 hover:bg-stone-100/80', borderLeft: 'border-l-[5px] border-l-stone-500' },
  { id: 'slate', label: 'Cool Slate', circleColor: '#cbd5e1', rowBg: 'bg-slate-100/80 hover:bg-slate-200/80', borderLeft: 'border-l-[5px] border-l-slate-500' },
]
