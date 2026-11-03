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
 * R-OT-01: Two-scenario Overtime (OT) Calculation for a single standalone shift window
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

export interface ShiftOTCandidate {
  id?: string
  date?: string
  staff_name?: string
  start_time?: string
  end_time?: string
  duty_hours?: number
  ot_hours?: number
  is_overtime?: boolean
  [key: string]: any
}

/**
 * R-OT-01: Daily Multi-Shift Cumulative Overtime Recalculator
 * Cumulatively calculates OT for each cleaner on each date:
 * 1. Shifts are grouped by date and cleaner name.
 * 2. Unconditionally assigns post-8:00 PM (20:00) time to Overtime (Scenario 1).
 * 3. Tracks pre-8:00 PM duty chronologically against the daily standard 8 basic hours (480 mins).
 * 4. Pre-8:00 PM hours exceeding the 8h daily basic threshold qualify as Overtime (Scenario 2).
 * 5. Time covered by two overlapping shifts of one cleaner is counted once: a person cannot work it twice.
 * 6. OT is always automatic (DEC-015): stored ot_hours and the old is_overtime flag are never read.
 * 7. A team job has one row but each cleaner has their own day, so each cleaner's OT is kept in
 *    _otByCleaner (see calcCleanerOTHours); the row's ot_hours shows the highest of them.
 */
export function recalculateAllRowsOT<T extends ShiftOTCandidate>(rows: T[]): T[] {
  if (!rows || rows.length === 0) return []

  const clonedRows = rows.map(r => ({ ...r, _otByCleaner: {} as Record<string, number> }))
  const setCleanerOT = (row: any, cleaner: string, hours: number) => {
    row._otByCleaner[cleaner] = hours
    row.ot_hours = Math.max(...(Object.values(row._otByCleaner) as number[]))
    row._otCalculated = true
  }

  // Group rows by Date and Cleaner Name
  // Key format: `${date}:::${cleanerName.toLowerCase()}`
  const groups = new Map<string, Array<{ row: T; origIdx: number }>>()

  clonedRows.forEach((row, origIdx) => {
    const rawStaff = (row.staff_name || '').trim()
    if (!rawStaff && (!row.start_time || row.start_time === '—')) {
      return
    }

    const dateKey = (row.date || 'default-date').trim()
    const names = rawStaff ? rawStaff.split(/[,+/&]|\band\b/i).map(s => s.trim()).filter(Boolean) : ['']
    names.forEach(cleaner => {
      const groupKey = `${dateKey}:::${cleaner.toLowerCase()}`
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push({ row, origIdx })
    })
  })

  const OT_CUTOFF = 20 * 60 // 8:00 PM (1200 mins)
  const BASIC_LIMIT_MINS = 8 * 60 // 8 basic hours (480 mins)

  groups.forEach((entries, groupKey) => {
    const cleaner = groupKey.split(':::')[1]
    const shiftsWithTimes: Array<{
      entry: { row: T; origIdx: number }
      sMins: number
      eMins: number
      dutyMins: number
    }> = []

    const shiftsWithoutTimes: Array<{ row: T; origIdx: number }> = []

    entries.forEach(e => {
      const sMins = parseTimeToMinutes(e.row.start_time)
      let eMins = parseTimeToMinutes(e.row.end_time)

      if (sMins !== null && eMins !== null && e.row.start_time !== '—' && e.row.end_time !== '—') {
        if (eMins < sMins) eMins += 24 * 60 // Overnight shift crossing midnight
        const dutyMins = eMins - sMins

        shiftsWithTimes.push({
          entry: e,
          sMins,
          eMins,
          dutyMins,
        })
      } else {
        shiftsWithoutTimes.push(e)
      }
    })

    // Sort chronologically by start time, then end time
    shiftsWithTimes.sort((a, b) => a.sMins - b.sMins || a.eMins - b.eMins)

    let usedPreMins = 0
    let coveredUntil = -1 // end of the time already counted for this cleaner

    shiftsWithTimes.forEach(item => {
      const row = item.entry.row
      const dutyHours = Math.round((item.dutyMins / 60) * 10) / 10
      row.duty_hours = dutyHours

      // Only the part of this shift not already covered by an earlier overlapping shift counts
      const countFrom = Math.max(item.sMins, coveredUntil)
      coveredUntil = Math.max(coveredUntil, item.eMins)

      // Scenario 1: Post-8:00 PM is unconditionally OT
      const postOtMins = Math.max(0, item.eMins - Math.max(countFrom, OT_CUTOFF))

      // Scenario 2: Pre-8:00 PM duty against remaining basic quota
      const preMins = Math.max(0, Math.min(item.eMins, OT_CUTOFF) - Math.min(countFrom, OT_CUTOFF))
      const remainingBasicQuota = Math.max(0, BASIC_LIMIT_MINS - usedPreMins)
      const basicAbsorbed = Math.min(preMins, remainingBasicQuota)
      const preExcessMins = preMins - basicAbsorbed
      usedPreMins += basicAbsorbed

      const totalOtMins = postOtMins + preExcessMins
      setCleanerOT(row, cleaner, Math.round((totalOtMins / 60) * 10) / 10)
    })

    // Process shifts without valid start/end times if any
    shiftsWithoutTimes.forEach(e => {
      const dutyMins = cleanNum(e.row.duty_hours) * 60
      const remainingBasicQuota = Math.max(0, BASIC_LIMIT_MINS - usedPreMins)
      const basicAbsorbed = Math.min(dutyMins, remainingBasicQuota)
      usedPreMins += basicAbsorbed
      setCleanerOT(e.row, cleaner, Math.round(((dutyMins - basicAbsorbed) / 60) * 10) / 10)
    })
  })

  return clonedRows
}

/** All OT of a row: the sum over its cleaners (a team job has one row but several cleaners) */
export function totalRowOT(row: ShiftOTCandidate): number {
  const perCleaner = row._otByCleaner ? (Object.values(row._otByCleaner) as number[]) : []
  return perCleaner.length > 0 ? perCleaner.reduce((s, h) => s + h, 0) : cleanNum(row.ot_hours)
}

/**
 * Returns a Map of row ID (or object key) -> recalculated ot_hours
 */
export function calcDailyCleanerShiftsOT<T extends ShiftOTCandidate>(rows: T[]): Map<string, number> {
  const recalculated = recalculateAllRowsOT(rows)
  const map = new Map<string, number>()
  recalculated.forEach((r, idx) => {
    const key = r.id || `row_${idx}`
    map.set(key, cleanNum(r.ot_hours))
  })
  return map
}

/**
 * Checks whether two time windows overlap (handles 24h & 12h formats and overnight shifts)
 */
export function checkTimesOverlap(startA?: string, endA?: string, startB?: string, endB?: string): boolean {
  if (!startA || !endA || !startB || !endB) return false
  const sA = parseTimeToMinutes(startA)
  let eA = parseTimeToMinutes(endA)
  const sB = parseTimeToMinutes(startB)
  let eB = parseTimeToMinutes(endB)
  if (sA === null || eA === null || sB === null || eB === null) return false
  if (eA <= sA) eA += 24 * 60
  if (eB <= sB) eB += 24 * 60
  return Math.max(sA, sB) < Math.min(eA, eB)
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
  // UX-69: 20 more light colours (owner request 2026-11-03)
  { id: 'mint', label: 'Mint', circleColor: '#c6f6e1', rowBg: 'bg-[#effcf6] hover:bg-[#e1f8ee]', borderLeft: 'border-l-[5px] border-l-[#34d399]' },
  { id: 'seafoam', label: 'Seafoam', circleColor: '#c3f0d8', rowBg: 'bg-[#f2fcf6] hover:bg-[#e3f8ec]', borderLeft: 'border-l-[5px] border-l-[#4ade80]' },
  { id: 'lagoon', label: 'Lagoon', circleColor: '#a7ece0', rowBg: 'bg-[#effbf8] hover:bg-[#dcf6f0]', borderLeft: 'border-l-[5px] border-l-[#14b8a6]' },
  { id: 'aqua', label: 'Aqua', circleColor: '#b8f2f2', rowBg: 'bg-[#f0fcfc] hover:bg-[#dcf7f7]', borderLeft: 'border-l-[5px] border-l-[#22d3ee]' },
  { id: 'powder', label: 'Powder Blue', circleColor: '#cfe9ff', rowBg: 'bg-[#f3f9ff] hover:bg-[#e1f0ff]', borderLeft: 'border-l-[5px] border-l-[#60a5fa]' },
  { id: 'periwinkle', label: 'Periwinkle', circleColor: '#cfd8ff', rowBg: 'bg-[#f4f6ff] hover:bg-[#e3e8ff]', borderLeft: 'border-l-[5px] border-l-[#818cf8]' },
  { id: 'lilac', label: 'Lilac', circleColor: '#e2d4ff', rowBg: 'bg-[#f8f4ff] hover:bg-[#eee6ff]', borderLeft: 'border-l-[5px] border-l-[#a78bfa]' },
  { id: 'orchid', label: 'Orchid', circleColor: '#f3d1f4', rowBg: 'bg-[#fdf4fd] hover:bg-[#f8e4f8]', borderLeft: 'border-l-[5px] border-l-[#d946ef]' },
  { id: 'blush', label: 'Blush', circleColor: '#ffd1e3', rowBg: 'bg-[#fff3f8] hover:bg-[#ffe4ef]', borderLeft: 'border-l-[5px] border-l-[#f472b6]' },
  { id: 'rosewater', label: 'Rosewater', circleColor: '#f8d7da', rowBg: 'bg-[#fdf4f5] hover:bg-[#fae6e8]', borderLeft: 'border-l-[5px] border-l-[#e11d48]' },
  { id: 'coral', label: 'Coral', circleColor: '#ffc9c0', rowBg: 'bg-[#fff3f1] hover:bg-[#ffe2dc]', borderLeft: 'border-l-[5px] border-l-[#f87171]' },
  { id: 'peach', label: 'Peach', circleColor: '#ffd8be', rowBg: 'bg-[#fff5ee] hover:bg-[#ffe8d9]', borderLeft: 'border-l-[5px] border-l-[#fb923c]' },
  { id: 'apricot', label: 'Apricot', circleColor: '#ffdcae', rowBg: 'bg-[#fff7ec] hover:bg-[#ffecd2]', borderLeft: 'border-l-[5px] border-l-[#ea580c]' },
  { id: 'butter', label: 'Butter', circleColor: '#ffe9a8', rowBg: 'bg-[#fffaeb] hover:bg-[#fff2cc]', borderLeft: 'border-l-[5px] border-l-[#f59e0b]' },
  { id: 'lemon', label: 'Lemon', circleColor: '#fff3a8', rowBg: 'bg-[#fffdeb] hover:bg-[#fff8c9]', borderLeft: 'border-l-[5px] border-l-[#eab308]' },
  { id: 'pistachio', label: 'Pistachio', circleColor: '#dff3c4', rowBg: 'bg-[#f8fdf0] hover:bg-[#ecf8db]', borderLeft: 'border-l-[5px] border-l-[#84cc16]' },
  { id: 'sage', label: 'Sage', circleColor: '#d4e4cf', rowBg: 'bg-[#f6faf4] hover:bg-[#e7f0e3]', borderLeft: 'border-l-[5px] border-l-[#65a30d]' },
  { id: 'sand', label: 'Sand', circleColor: '#eadfc8', rowBg: 'bg-[#fbf8f1] hover:bg-[#f3ecdd]', borderLeft: 'border-l-[5px] border-l-[#a8a29e]' },
  { id: 'latte', label: 'Latte', circleColor: '#e8d5c4', rowBg: 'bg-[#fbf6f1] hover:bg-[#f2e6db]', borderLeft: 'border-l-[5px] border-l-[#b45309]' },
  { id: 'silver', label: 'Silver Mist', circleColor: '#e2e8f0', rowBg: 'bg-[#f8fafc] hover:bg-[#eef2f6]', borderLeft: 'border-l-[5px] border-l-[#94a3b8]' },
]
