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
  { id: 'rose', label: 'Light Red', circleColor: '#ffd6d6', rowBg: 'bg-[#ffd6d6] hover:bg-[#ffb8b8]', borderLeft: 'border-l-[5px] border-l-[#b81414]' },
  { id: 'c02', label: 'Soft Coral', circleColor: '#fdbeb4', rowBg: 'bg-[#fdbeb4] hover:bg-[#fca497]', borderLeft: 'border-l-[5px] border-l-[#b82a14]' },
  { id: 'c03', label: 'Soft Orange', circleColor: '#efd1be', rowBg: 'bg-[#efd1be] hover:bg-[#e9c0a5]', borderLeft: 'border-l-[5px] border-l-[#a35a29]' },
  { id: 'orange', label: 'Light Orange', circleColor: '#ffe9d6', rowBg: 'bg-[#ffe9d6] hover:bg-[#ffd9b8]', borderLeft: 'border-l-[5px] border-l-[#b86114]' },
  { id: 'c05', label: 'Soft Orange 2', circleColor: '#f8ceaa', rowBg: 'bg-[#f8ceaa] hover:bg-[#f6be8e]', borderLeft: 'border-l-[5px] border-l-[#b86114]' },
  { id: 'yellow', label: 'Light Amber', circleColor: '#ffebc2', rowBg: 'bg-[#ffebc2] hover:bg-[#ffe0a3]', borderLeft: 'border-l-[5px] border-l-[#b88114]' },
  { id: 'c07', label: 'Soft Amber', circleColor: '#f8deaa', rowBg: 'bg-[#f8deaa] hover:bg-[#f6d38e]', borderLeft: 'border-l-[5px] border-l-[#b88114]' },
  { id: 'c08', label: 'Soft Yellow', circleColor: '#fdf3b4', rowBg: 'bg-[#fdf3b4] hover:bg-[#fcef97]', borderLeft: 'border-l-[5px] border-l-[#b8a214]' },
  { id: 'slate', label: 'Pale Yellow', circleColor: '#f2f1d9', rowBg: 'bg-[#f2f1d9] hover:bg-[#ebe8c2]', borderLeft: 'border-l-[5px] border-l-[#999233]' },
  { id: 'c10', label: 'Soft Lemon', circleColor: '#f3f8aa', rowBg: 'bg-[#f3f8aa] hover:bg-[#eff68e]', borderLeft: 'border-l-[5px] border-l-[#adb814]' },
  { id: 'lime', label: 'Soft Lime', circleColor: '#e2efbe', rowBg: 'bg-[#e2efbe] hover:bg-[#d7e9a5]', borderLeft: 'border-l-[5px] border-l-[#83a329]' },
  { id: 'c12', label: 'Soft Lime 2', circleColor: '#d9f8aa', rowBg: 'bg-[#d9f8aa] hover:bg-[#ccf68e]', borderLeft: 'border-l-[5px] border-l-[#76b814]' },
  { id: 'c13', label: 'Soft Green', circleColor: '#c4f8aa', rowBg: 'bg-[#c4f8aa] hover:bg-[#b0f68e]', borderLeft: 'border-l-[5px] border-l-[#4bb814]' },
  { id: 'c14', label: 'Light Mint', circleColor: '#ceffc2', rowBg: 'bg-[#ceffc2] hover:bg-[#b6ffa3]', borderLeft: 'border-l-[5px] border-l-[#35b814]' },
  { id: 'green', label: 'Pale Mint', circleColor: '#dcf2d9', rowBg: 'bg-[#dcf2d9] hover:bg-[#c7ebc2]', borderLeft: 'border-l-[5px] border-l-[#419933]' },
  { id: 'c16', label: 'Soft Emerald', circleColor: '#aaf8aa', rowBg: 'bg-[#aaf8aa] hover:bg-[#8ef68e]', borderLeft: 'border-l-[5px] border-l-[#14b814]' },
  { id: 'c17', label: 'Light Emerald', circleColor: '#cbf6ce', rowBg: 'bg-[#cbf6ce] hover:bg-[#b1f1b5]', borderLeft: 'border-l-[5px] border-l-[#1fad28]' },
  { id: 'c18', label: 'Soft Jade', circleColor: '#aaf8c4', rowBg: 'bg-[#aaf8c4] hover:bg-[#8ef6b0]', borderLeft: 'border-l-[5px] border-l-[#14b84b]' },
  { id: 'c19', label: 'Soft Teal', circleColor: '#beefd5', rowBg: 'bg-[#beefd5] hover:bg-[#a5e9c5]', borderLeft: 'border-l-[5px] border-l-[#29a362]' },
  { id: 'emerald', label: 'Light Aqua', circleColor: '#cbf6e8', rowBg: 'bg-[#cbf6e8] hover:bg-[#b1f1dc]', borderLeft: 'border-l-[5px] border-l-[#1fad7e]' },
  { id: 'c21', label: 'Soft Aqua', circleColor: '#aaf8de', rowBg: 'bg-[#aaf8de] hover:bg-[#8ef6d3]', borderLeft: 'border-l-[5px] border-l-[#14b881]' },
  { id: 'teal', label: 'Pale Cyan', circleColor: '#d9f2ef', rowBg: 'bg-[#d9f2ef] hover:bg-[#c2ebe5]', borderLeft: 'border-l-[5px] border-l-[#33998b]' },
  { id: 'c23', label: 'Soft Sky', circleColor: '#aaf8f8', rowBg: 'bg-[#aaf8f8] hover:bg-[#8ef6f6]', borderLeft: 'border-l-[5px] border-l-[#14b8b8]' },
  { id: 'c24', label: 'Light Azure', circleColor: '#c2f3ff', rowBg: 'bg-[#c2f3ff] hover:bg-[#a3edff]', borderLeft: 'border-l-[5px] border-l-[#1497b8]' },
  { id: 'c25', label: 'Soft Blue', circleColor: '#aadef8', rowBg: 'bg-[#aadef8] hover:bg-[#8ed3f6]', borderLeft: 'border-l-[5px] border-l-[#1481b8]' },
  { id: 'sky', label: 'Pale Blue', circleColor: '#d9e8f2', rowBg: 'bg-[#d9e8f2] hover:bg-[#c2daeb]', borderLeft: 'border-l-[5px] border-l-[#337099]' },
  { id: 'blue', label: 'Soft Cobalt', circleColor: '#bed1ef', rowBg: 'bg-[#bed1ef] hover:bg-[#a5c0e9]', borderLeft: 'border-l-[5px] border-l-[#295aa3]' },
  { id: 'c28', label: 'Soft Indigo', circleColor: '#b4cdfd', rowBg: 'bg-[#b4cdfd] hover:bg-[#97b8fc]', borderLeft: 'border-l-[5px] border-l-[#144bb8]' },
  { id: 'indigo', label: 'Light Violet', circleColor: '#d4cbf6', rowBg: 'bg-[#d4cbf6] hover:bg-[#beb1f1]', borderLeft: 'border-l-[5px] border-l-[#3b1fad]' },
  { id: 'purple', label: 'Pale Lavender', circleColor: '#e3d9f2', rowBg: 'bg-[#e3d9f2] hover:bg-[#d2c2eb]', borderLeft: 'border-l-[5px] border-l-[#5c3399]' },
  { id: 'c31', label: 'Light Lavender', circleColor: '#dac2ff', rowBg: 'bg-[#dac2ff] hover:bg-[#c8a3ff]', borderLeft: 'border-l-[5px] border-l-[#5614b8]' },
  { id: 'violet', label: 'Light Magenta', circleColor: '#fad6ff', rowBg: 'bg-[#fad6ff] hover:bg-[#f5b8ff]', borderLeft: 'border-l-[5px] border-l-[#a214b8]' },
  { id: 'c33', label: 'Soft Fuchsia', circleColor: '#fdb4fd', rowBg: 'bg-[#fdb4fd] hover:bg-[#fc97fc]', borderLeft: 'border-l-[5px] border-l-[#b814b8]' },
  { id: 'c34', label: 'Light Fuchsia', circleColor: '#ffc2f7', rowBg: 'bg-[#ffc2f7] hover:bg-[#ffa3f3]', borderLeft: 'border-l-[5px] border-l-[#b814a2]' },
  { id: 'c35', label: 'Soft Pink', circleColor: '#efbee5', rowBg: 'bg-[#efbee5] hover:bg-[#e9a5db]', borderLeft: 'border-l-[5px] border-l-[#a3298b]' },
  { id: 'fuchsia', label: 'Light Raspberry', circleColor: '#ffd6e9', rowBg: 'bg-[#ffd6e9] hover:bg-[#ffb8d9]', borderLeft: 'border-l-[5px] border-l-[#b81461]' },
  { id: 'c37', label: 'Light Raspberry 2', circleColor: '#ffc2da', rowBg: 'bg-[#ffc2da] hover:bg-[#ffa3c8]', borderLeft: 'border-l-[5px] border-l-[#b81456]' },
  { id: 'pink', label: 'Pale Raspberry', circleColor: '#f2d9e1', rowBg: 'bg-[#f2d9e1] hover:bg-[#ebc2cf]', borderLeft: 'border-l-[5px] border-l-[#993355]' },
  { id: 'raspberry', label: 'Light Ruby', circleColor: '#ffc2ca', rowBg: 'bg-[#ffc2ca] hover:bg-[#ffa3af]', borderLeft: 'border-l-[5px] border-l-[#b8142a]' },
  { id: 'stone', label: 'Stone Grey', circleColor: '#ddd9d4', rowBg: 'bg-[#ddd9d4] hover:bg-[#d0c9c3]', borderLeft: 'border-l-[5px] border-l-[#72665a]' },
]
