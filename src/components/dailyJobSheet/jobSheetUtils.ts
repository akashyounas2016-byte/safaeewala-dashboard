import type { PaymentMode, MaterialType } from '@/types'
import { todayDubai } from '@/lib/dubaiTime'
import { BLOCK_PALETTES, makeHexPalette } from '@/lib/excelSheet/palettes'

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

  // 12-hour format e.g. "08:30 AM", "4:00 PM", "12:00pm", "9:15am", "9:15 am", "9.15am", "9.15 am"
  const ampmMatch = str.match(/\b(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10)
    const mm = parseInt(ampmMatch[2], 10)
    const mer = ampmMatch[3].toUpperCase()
    if (mer === 'PM' && hh < 12) hh += 12
    if (mer === 'AM' && hh === 12) hh = 0
    return (hh * 60 + mm) % (24 * 60)
  }

  // Hour only with AM/PM e.g. "9am", "9 pm", "10AM", "12PM"
  const hourAmPmMatch = str.match(/\b(\d{1,2})\s*(AM|PM)\b/i)
  if (hourAmPmMatch) {
    let hh = parseInt(hourAmPmMatch[1], 10)
    const mer = hourAmPmMatch[2].toUpperCase()
    if (mer === 'PM' && hh < 12) hh += 12
    if (mer === 'AM' && hh === 12) hh = 0
    return (hh * 60) % (24 * 60)
  }

  // 24-hour format or colon/dot separated e.g. "08:30", "16:00", "20:15", "9:15", "9.15"
  const timeMatch = str.match(/\b(\d{1,2})[:.](\d{2})(?::\d{2})?\b/)
  if (timeMatch) {
    let hh = parseInt(timeMatch[1], 10)
    const mm = parseInt(timeMatch[2], 10)
    // In daytime cleaning context, 1:00 to 6:59 without AM/PM is afternoon (PM)
    if (hh >= 1 && hh <= 6) hh += 12
    return (hh * 60 + mm) % (24 * 60)
  }

  // 3 or 4 digits without separator e.g. "0915", "1430", "930"
  const digitsMatch = str.match(/^(\d{1,2})(\d{2})$/)
  if (digitsMatch) {
    let hh = parseInt(digitsMatch[1], 10)
    const mm = parseInt(digitsMatch[2], 10)
    if (hh < 24 && mm < 60) {
      if (hh >= 1 && hh <= 6) hh += 12
      return (hh * 60 + mm) % (24 * 60)
    }
  }

  // Single or double digit hour only e.g. "9", "14"
  const singleHourMatch = str.match(/^(\d{1,2})$/)
  if (singleHourMatch) {
    let hh = parseInt(singleHourMatch[1], 10)
    if (hh >= 1 && hh <= 6) hh += 12
    if (hh < 24) {
      return (hh * 60) % (24 * 60)
    }
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
export function calcOTHours(start: string, end: string, basicHours: number = DEFAULT_BASIC_HOURS): number {
  const startMins = parseTimeToMinutes(start)
  let endMins     = parseTimeToMinutes(end)
  if (startMins === null || endMins === null) return 0
  // Shift crossing midnight (e.g. 19:00 → 01:00) ends on the next day
  if (endMins < startMins) endMins += 24 * 60

  const OT_CUTOFF = 20 * 60 // 8:00 PM (1200 mins)
  const BASIC_LIMIT_MINS = validBasic(basicHours) * 60 // R-OT-03: the employee's Total Duty Hours (default 8)

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

/**
 * R-OT-03: basic hours are per employee — "Total Duty Hours" in the Add Employee popup.
 * 8 h employee → OT after 8 h (or after 8 PM); 10 h employee → OT after 10 h (or after 8 PM).
 * The data layer registers every employee's hours by name (full and short, lower case) once they load,
 * so every screen that calls recalculateAllRowsOT uses the same limits. Unknown / blank → 8 h.
 */
export const DEFAULT_BASIC_HOURS = 8
const validBasic = (h: unknown) => {
  const n = Number(h)
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : DEFAULT_BASIC_HOURS
}
let basicHoursByName = new Map<string, number>()
export function setCleanerBasicHours(employees: Array<{ full_name?: string; short_name?: string; total_duty_hours?: number | null }>): void {
  const m = new Map<string, number>()
  employees.forEach(e => {
    const h = Number(e.total_duty_hours)
    if (!Number.isFinite(h) || h <= 0 || h > 24) return
    ;[e.full_name, e.short_name].forEach(n => { const k = (n || '').trim().toLowerCase(); if (k && !m.has(k)) m.set(k, h) })
  })
  basicHoursByName = m
}
export function basicHoursFor(cleaner: string | undefined): number {
  return basicHoursByName.get((cleaner || '').trim().toLowerCase()) ?? DEFAULT_BASIC_HOURS
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
 * 3. Tracks pre-8:00 PM duty chronologically against the cleaner's basic hours (R-OT-03: Total Duty Hours, default 8).
 * 4. Pre-8:00 PM hours exceeding that daily basic threshold qualify as Overtime (Scenario 2).
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

  groups.forEach((entries, groupKey) => {
    const cleaner = groupKey.split(':::')[1]
    const BASIC_LIMIT_MINS = basicHoursFor(cleaner) * 60 // R-OT-03: this cleaner's Total Duty Hours
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
  { id: 'driver',       label: 'Driver' },   // UX-94: from the Drivers day plan
  { id: 'status',       label: 'Status' },   // UX-94: from My Duties check-ins
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
  driver:       true,
  status:       true,
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

/**
 * Row colours (UX-69, revised 2026-11-17 — UX-169): 40 light colours only (CIE L* ≥ 80, none near-white), picked to be
 * as far apart as light colours can be by CIEDE2000 (closest two ≥ 7.5). Shown as swatches without names in Add Job
 * (Daily and Excel sheet) and New Booking. Older ids moved to their nearest colour.
 */
export const ROW_COLOR_PRESETS: RowColorPreset[] = [
  { id: 'default', label: 'Default', circleColor: '#ffffff', rowBg: '', borderLeft: '' },
  { id: 'pink', label: 'Colour 1', circleColor: '#fac6c6', rowBg: 'bg-[#fac6c6] hover:bg-[#e6b6b6]', borderLeft: 'border-l-[5px] border-l-[#a51212]' },
  { id: 'c03', label: 'Colour 2', circleColor: '#fde4e3', rowBg: 'bg-[#fde4e3] hover:bg-[#e9d2d1]', borderLeft: 'border-l-[5px] border-l-[#a51812]' },
  { id: 'raspberry', label: 'Colour 3', circleColor: '#e0c5b8', rowBg: 'bg-[#e0c5b8] hover:bg-[#ceb5a9]', borderLeft: 'border-l-[5px] border-l-[#854d32]' },
  { id: 'c02', label: 'Colour 4', circleColor: '#f7bea1', rowBg: 'bg-[#f7bea1] hover:bg-[#e3af94]', borderLeft: 'border-l-[5px] border-l-[#a54412]' },
  { id: 'c05', label: 'Colour 5', circleColor: '#ffe7d1', rowBg: 'bg-[#ffe7d1] hover:bg-[#ebd5c0]', borderLeft: 'border-l-[5px] border-l-[#a55912]' },
  { id: 'orange', label: 'Colour 6', circleColor: '#ffbc70', rowBg: 'bg-[#ffbc70] hover:bg-[#ebad67]', borderLeft: 'border-l-[5px] border-l-[#a56012]' },
  { id: 'c12', label: 'Colour 7', circleColor: '#f7cfa1', rowBg: 'bg-[#f7cfa1] hover:bg-[#e3be94]', borderLeft: 'border-l-[5px] border-l-[#a56112]' },
  { id: 'c08', label: 'Colour 8', circleColor: '#ffcf70', rowBg: 'bg-[#ffcf70] hover:bg-[#ebbe67]', borderLeft: 'border-l-[5px] border-l-[#a57412]' },
  { id: 'c06', label: 'Colour 9', circleColor: '#d1c7b3', rowBg: 'bg-[#d1c7b3] hover:bg-[#c0b7a5]', borderLeft: 'border-l-[5px] border-l-[#856a32]' },
  { id: 'c09', label: 'Colour 10', circleColor: '#dfca90', rowBg: 'bg-[#dfca90] hover:bg-[#cdba84]', borderLeft: 'border-l-[5px] border-l-[#8f7429]' },
  { id: 'c37', label: 'Colour 11', circleColor: '#f5f0db', rowBg: 'bg-[#f5f0db] hover:bg-[#e1ddc9]', borderLeft: 'border-l-[5px] border-l-[#907c28]' },
  { id: 'c07', label: 'Colour 12', circleColor: '#f3ebba', rowBg: 'bg-[#f3ebba] hover:bg-[#e0d8ab]', borderLeft: 'border-l-[5px] border-l-[#9c8a1b]' },
  { id: 'yellow', label: 'Colour 13', circleColor: '#f6f68e', rowBg: 'bg-[#f6f68e] hover:bg-[#e2e283]', borderLeft: 'border-l-[5px] border-l-[#a5a512]' },
  { id: 'c40', label: 'Colour 14', circleColor: '#c9d1b3', rowBg: 'bg-[#c9d1b3] hover:bg-[#b9c0a5]', borderLeft: 'border-l-[5px] border-l-[#6f8532]' },
  { id: 'lime', label: 'Colour 15', circleColor: '#cfff99', rowBg: 'bg-[#cfff99] hover:bg-[#beeb8d]', borderLeft: 'border-l-[5px] border-l-[#60a512]' },
  { id: 'c13', label: 'Colour 16', circleColor: '#bad49b', rowBg: 'bg-[#bad49b] hover:bg-[#abc38f]', borderLeft: 'border-l-[5px] border-l-[#5f8532]' },
  { id: 'stone', label: 'Colour 17', circleColor: '#e4f5db', rowBg: 'bg-[#e4f5db] hover:bg-[#d2e1c9]', borderLeft: 'border-l-[5px] border-l-[#4c9028]' },
  { id: 'green', label: 'Colour 18', circleColor: '#96df90', rowBg: 'bg-[#96df90] hover:bg-[#8acd84]', borderLeft: 'border-l-[5px] border-l-[#318f29]' },
  { id: 'emerald', label: 'Colour 19', circleColor: '#9bd4aa', rowBg: 'bg-[#9bd4aa] hover:bg-[#8fc39c]', borderLeft: 'border-l-[5px] border-l-[#328548]' },
  { id: 'c16', label: 'Colour 20', circleColor: '#c6fad8', rowBg: 'bg-[#c6fad8] hover:bg-[#b6e6c7]', borderLeft: 'border-l-[5px] border-l-[#12a545]' },
  { id: 'c14', label: 'Colour 21', circleColor: '#7bf4b4', rowBg: 'bg-[#7bf4b4] hover:bg-[#71e0a6]', borderLeft: 'border-l-[5px] border-l-[#12a558]' },
  { id: 'c21', label: 'Colour 22', circleColor: '#85ffde', rowBg: 'bg-[#85ffde] hover:bg-[#7aebcc]', borderLeft: 'border-l-[5px] border-l-[#12a57e]' },
  { id: 'c19', label: 'Colour 23', circleColor: '#a0e3d2', rowBg: 'bg-[#a0e3d2] hover:bg-[#93d1c1]', borderLeft: 'border-l-[5px] border-l-[#2a8e74]' },
  { id: 'c24', label: 'Colour 24', circleColor: '#b3d1cd', rowBg: 'bg-[#b3d1cd] hover:bg-[#a5c0bd]', borderLeft: 'border-l-[5px] border-l-[#32857a]' },
  { id: 'sky', label: 'Colour 25', circleColor: '#85ffff', rowBg: 'bg-[#85ffff] hover:bg-[#7aebeb]', borderLeft: 'border-l-[5px] border-l-[#12a5a5]' },
  { id: 'c31', label: 'Colour 26', circleColor: '#cbf6f6', rowBg: 'bg-[#cbf6f6] hover:bg-[#bbe2e2]', borderLeft: 'border-l-[5px] border-l-[#1b9d9d]' },
  { id: 'teal', label: 'Colour 27', circleColor: '#90dadf', rowBg: 'bg-[#90dadf] hover:bg-[#84c9cd]', borderLeft: 'border-l-[5px] border-l-[#29888f]' },
  { id: 'c28', label: 'Colour 28', circleColor: '#b0d9e8', rowBg: 'bg-[#b0d9e8] hover:bg-[#a2c8d5]', borderLeft: 'border-l-[5px] border-l-[#29738e]' },
  { id: 'c26', label: 'Colour 29', circleColor: '#70d9ff', rowBg: 'bg-[#70d9ff] hover:bg-[#67c8eb]', borderLeft: 'border-l-[5px] border-l-[#127ea5]' },
  { id: 'c18', label: 'Colour 30', circleColor: '#e0f1ff', rowBg: 'bg-[#e0f1ff] hover:bg-[#cedeeb]', borderLeft: 'border-l-[5px] border-l-[#1263a5]' },
  { id: 'blue', label: 'Colour 31', circleColor: '#99cfff', rowBg: 'bg-[#99cfff] hover:bg-[#8dbeeb]', borderLeft: 'border-l-[5px] border-l-[#1260a5]' },
  { id: 'slate', label: 'Colour 32', circleColor: '#bfc8d9', rowBg: 'bg-[#bfc8d9] hover:bg-[#b0b8c8]', borderLeft: 'border-l-[5px] border-l-[#324f85]' },
  { id: 'violet', label: 'Colour 33', circleColor: '#b4c6f9', rowBg: 'bg-[#b4c6f9] hover:bg-[#a6b6e5]', borderLeft: 'border-l-[5px] border-l-[#1239a5]' },
  { id: 'indigo', label: 'Colour 34', circleColor: '#d5dafc', rowBg: 'bg-[#d5dafc] hover:bg-[#c4c9e8]', borderLeft: 'border-l-[5px] border-l-[#1225a5]' },
  { id: 'c34', label: 'Colour 35', circleColor: '#cfc0ed', rowBg: 'bg-[#cfc0ed] hover:bg-[#beb1da]', borderLeft: 'border-l-[5px] border-l-[#4b298f]' },
  { id: 'c22', label: 'Colour 36', circleColor: '#efe7f8', rowBg: 'bg-[#efe7f8] hover:bg-[#dcd5e4]', borderLeft: 'border-l-[5px] border-l-[#59298e]' },
  { id: 'purple', label: 'Colour 37', circleColor: '#faadff', rowBg: 'bg-[#faadff] hover:bg-[#e69feb]', borderLeft: 'border-l-[5px] border-l-[#9c12a5]' },
  { id: 'c29', label: 'Colour 38', circleColor: '#d9bfd4', rowBg: 'bg-[#d9bfd4] hover:bg-[#c8b0c3]', borderLeft: 'border-l-[5px] border-l-[#853275]' },
  { id: 'fuchsia', label: 'Colour 39', circleColor: '#ffd1f3', rowBg: 'bg-[#ffd1f3] hover:bg-[#ebc0e0]', borderLeft: 'border-l-[5px] border-l-[#a5127f]' },
  { id: 'rose', label: 'Colour 40', circleColor: '#f9b4cb', rowBg: 'bg-[#f9b4cb] hover:bg-[#e5a6bb]', borderLeft: 'border-l-[5px] border-l-[#a51243]' },
]

/**
 * A saved column order plus any column added since, each new one placed right after the column
 * that precedes it in ALL_COLUMNS (so Driver / Status land before Remarks, not at the end) — UX-94.
 */
export function mergeColumnOrder(saved: string[]): string[] {
  const order = saved.filter(id => ALL_COLUMNS.some(c => c.id === id))
  ALL_COLUMNS.forEach((c, i) => {
    if (order.includes(c.id)) return
    const before = ALL_COLUMNS.slice(0, i).reverse().find(p => order.includes(p.id))
    order.splice(before ? order.indexOf(before.id) + 1 : 0, 0, c.id)
  })
  return order
}

/**
 * R-SYNC-11: the colour of a row, whichever sheet set it. The Daily Job Sheet stores a ROW_COLOR_PRESETS id;
 * the Excel Job Sheet stores a block palette key (emerald, sky …) or a custom hex. Both show on both sheets.
 */
export function rowColorOf(rowColor?: string | null): { bg: string; borderLeft: string } | null {
  const id = String(rowColor || '').trim()
  if (!id || id === 'default') return null
  const preset = ROW_COLOR_PRESETS.find(p => p.id === id)
  if (preset?.circleColor) return { bg: preset.circleColor, borderLeft: preset.borderLeft }
  const block = BLOCK_PALETTES[id] || (/^#[0-9a-f]{3,8}$/i.test(id) ? makeHexPalette(id) : null)
  return block ? { bg: block.solidBg, borderLeft: block.borderLeft } : null
}
