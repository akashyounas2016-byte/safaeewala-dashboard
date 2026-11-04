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

/**
 * Row colours (UX-69, revised 2026-11-04): 40 light colours chosen to be as far apart as possible in the
 * CIE Lab colour space (minimum distance checked in tests), so no two look the same. The swatch and the
 * Excel row use the colour itself. Older ids are kept on their nearest colour, so saved rows keep a colour.
 */
export const ROW_COLOR_PRESETS: RowColorPreset[] = [
  { id: 'default', label: 'Default', circleColor: '#ffffff', rowBg: '', borderLeft: '' },
  { id: 'rose', label: 'Light Red', circleColor: '#fcc5c5', rowBg: 'bg-[#fcc5c5] hover:bg-[#faa8a8]', borderLeft: 'border-l-[5px] border-l-[#b81414]' },
  { id: 'c02', label: 'Soft Red', circleColor: '#f6acac', rowBg: 'bg-[#f6acac] hover:bg-[#f39191]', borderLeft: 'border-l-[5px] border-l-[#b81414]' },
  { id: 'c03', label: 'Dusty Coral', circleColor: '#e0bbae', rowBg: 'bg-[#e0bbae] hover:bg-[#d8a997]', borderLeft: 'border-l-[5px] border-l-[#945138]' },
  { id: 'raspberry', label: 'Light Orange', circleColor: '#fcd7c5', rowBg: 'bg-[#fcd7c5] hover:bg-[#fac3a8]', borderLeft: 'border-l-[5px] border-l-[#b84b14]' },
  { id: 'c05', label: 'Bright Orange', circleColor: '#edb497', rowBg: 'bg-[#edb497] hover:bg-[#e8a17d]', borderLeft: 'border-l-[5px] border-l-[#ad4e1f]' },
  { id: 'orange', label: 'Light Apricot', circleColor: '#fce6c5', rowBg: 'bg-[#fce6c5] hover:bg-[#fad9a8]', borderLeft: 'border-l-[5px] border-l-[#b87614]' },
  { id: 'slate', label: 'Dusty Apricot', circleColor: '#e0ccae', rowBg: 'bg-[#e0ccae] hover:bg-[#d8be97]', borderLeft: 'border-l-[5px] border-l-[#946f38]' },
  { id: 'c08', label: 'Bright Apricot', circleColor: '#edca97', rowBg: 'bg-[#edca97] hover:bg-[#e8bd7d]', borderLeft: 'border-l-[5px] border-l-[#ad741f]' },
  { id: 'c09', label: 'Bright Amber', circleColor: '#eddc97', rowBg: 'bg-[#eddc97] hover:bg-[#e8d37d]', borderLeft: 'border-l-[5px] border-l-[#ad911f]' },
  { id: 'c10', label: 'Bright Yellow', circleColor: '#eded97', rowBg: 'bg-[#eded97] hover:bg-[#e8e87d]', borderLeft: 'border-l-[5px] border-l-[#adad1f]' },
  { id: 'yellow', label: 'Pale Lemon', circleColor: '#eaedc0', rowBg: 'bg-[#eaedc0] hover:bg-[#e2e6a8]', borderLeft: 'border-l-[5px] border-l-[#979e2e]' },
  { id: 'c12', label: 'Bright Lime', circleColor: '#d0ed97', rowBg: 'bg-[#d0ed97] hover:bg-[#c4e87d]', borderLeft: 'border-l-[5px] border-l-[#7ead1f]' },
  { id: 'lime', label: 'Dusty Chartreuse', circleColor: '#c9e0ae', rowBg: 'bg-[#c9e0ae] hover:bg-[#bad897]', borderLeft: 'border-l-[5px] border-l-[#699438]' },
  { id: 'c14', label: 'Soft Mint', circleColor: '#bbf6ac', rowBg: 'bg-[#bbf6ac] hover:bg-[#a4f391]', borderLeft: 'border-l-[5px] border-l-[#35b814]' },
  { id: 'c15', label: 'Bright Emerald', circleColor: '#97ed97', rowBg: 'bg-[#97ed97] hover:bg-[#7de87d]', borderLeft: 'border-l-[5px] border-l-[#1fad1f]' },
  { id: 'green', label: 'Pale Emerald', circleColor: '#c0edc3', rowBg: 'bg-[#c0edc3] hover:bg-[#a8e6ac]', borderLeft: 'border-l-[5px] border-l-[#2e9e35]' },
  { id: 'c17', label: 'Bright Jade', circleColor: '#97edb4', rowBg: 'bg-[#97edb4] hover:bg-[#7de8a1]', borderLeft: 'border-l-[5px] border-l-[#1fad4e]' },
  { id: 'c18', label: 'Soft Teal', circleColor: '#acf6cf', rowBg: 'bg-[#acf6cf] hover:bg-[#91f3bf]', borderLeft: 'border-l-[5px] border-l-[#14b861]' },
  { id: 'emerald', label: 'Pale Aqua', circleColor: '#c0edde', rowBg: 'bg-[#c0edde] hover:bg-[#a8e6d1]', borderLeft: 'border-l-[5px] border-l-[#2e9e79]' },
  { id: 'c20', label: 'Bright Cyan', circleColor: '#97edd6', rowBg: 'bg-[#97edd6] hover:bg-[#7de8cb]', borderLeft: 'border-l-[5px] border-l-[#1fad87]' },
  { id: 'c21', label: 'Soft Cyan', circleColor: '#acf6ec', rowBg: 'bg-[#acf6ec] hover:bg-[#91f3e6]', borderLeft: 'border-l-[5px] border-l-[#14b8a2]' },
  { id: 'teal', label: 'Dusty Sky', circleColor: '#aedde0', rowBg: 'bg-[#aedde0] hover:bg-[#97d3d8]', borderLeft: 'border-l-[5px] border-l-[#388e94]' },
  { id: 'c23', label: 'Bright Sky', circleColor: '#97e7ed', rowBg: 'bg-[#97e7ed] hover:bg-[#7de1e8]', borderLeft: 'border-l-[5px] border-l-[#1fa4ad]' },
  { id: 'sky', label: 'Light Azure', circleColor: '#c5edfc', rowBg: 'bg-[#c5edfc] hover:bg-[#a8e4fa]', borderLeft: 'border-l-[5px] border-l-[#148cb8]' },
  { id: 'c25', label: 'Bright Blue', circleColor: '#97d0ed', rowBg: 'bg-[#97d0ed] hover:bg-[#7dc4e8]', borderLeft: 'border-l-[5px] border-l-[#1f7ead]' },
  { id: 'c26', label: 'Bright Cobalt', circleColor: '#97b9ed', rowBg: 'bg-[#97b9ed] hover:bg-[#7da8e8]', borderLeft: 'border-l-[5px] border-l-[#1f58ad]' },
  { id: 'blue', label: 'Pale Indigo', circleColor: '#c0cfed', rowBg: 'bg-[#c0cfed] hover:bg-[#a8bde6]', borderLeft: 'border-l-[5px] border-l-[#2e539e]' },
  { id: 'c28', label: 'Dusty Indigo', circleColor: '#aeb8e0', rowBg: 'bg-[#aeb8e0] hover:bg-[#97a4d8]', borderLeft: 'border-l-[5px] border-l-[#384a94]' },
  { id: 'indigo', label: 'Light Iris', circleColor: '#c5c9fc', rowBg: 'bg-[#c5c9fc] hover:bg-[#a8adfa]', borderLeft: 'border-l-[5px] border-l-[#141fb8]' },
  { id: 'c30', label: 'Soft Iris', circleColor: '#acb1f6', rowBg: 'bg-[#acb1f6] hover:bg-[#9197f3]', borderLeft: 'border-l-[5px] border-l-[#141fb8]' },
  { id: 'c31', label: 'Soft Orchid', circleColor: '#d8acf6', rowBg: 'bg-[#d8acf6] hover:bg-[#cc91f3]', borderLeft: 'border-l-[5px] border-l-[#7614b8]' },
  { id: 'violet', label: 'Pale Orchid', circleColor: '#dec0ed', rowBg: 'bg-[#dec0ed] hover:bg-[#d1a8e6]', borderLeft: 'border-l-[5px] border-l-[#792e9e]' },
  { id: 'fuchsia', label: 'Light Fuchsia', circleColor: '#fcc5fc', rowBg: 'bg-[#fcc5fc] hover:bg-[#faa8fa]', borderLeft: 'border-l-[5px] border-l-[#b814b8]' },
  { id: 'c34', label: 'Soft Fuchsia', circleColor: '#f6acf6', rowBg: 'bg-[#f6acf6] hover:bg-[#f391f3]', borderLeft: 'border-l-[5px] border-l-[#b814b8]' },
  { id: 'c35', label: 'Dusty Pink', circleColor: '#e0aed6', rowBg: 'bg-[#e0aed6] hover:bg-[#d897cb]', borderLeft: 'border-l-[5px] border-l-[#943882]' },
  { id: 'c36', label: 'Soft Pink', circleColor: '#f6ace2', rowBg: 'bg-[#f6ace2] hover:bg-[#f391d9]', borderLeft: 'border-l-[5px] border-l-[#b8148c]' },
  { id: 'purple', label: 'Pale Rose', circleColor: '#edc0d8', rowBg: 'bg-[#edc0d8] hover:bg-[#e6a8c9]', borderLeft: 'border-l-[5px] border-l-[#9e2e6a]' },
  { id: 'c38', label: 'Soft Raspberry', circleColor: '#f6acc5', rowBg: 'bg-[#f6acc5] hover:bg-[#f391b1]', borderLeft: 'border-l-[5px] border-l-[#b8144b]' },
  { id: 'pink', label: 'Dusty Ruby', circleColor: '#e0aeb8', rowBg: 'bg-[#e0aeb8] hover:bg-[#d897a4]', borderLeft: 'border-l-[5px] border-l-[#94384a]' },
  { id: 'stone', label: 'Stone Grey', circleColor: '#e0dbd7', rowBg: 'bg-[#e0dbd7] hover:bg-[#d2ccc6]', borderLeft: 'border-l-[5px] border-l-[#72665a]' },
]
