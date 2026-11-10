import type { DailyJob } from '@/types'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { safeLocalStorageSet } from '@/lib/storageUtils'
import { projectKey } from '@/lib/excelTeams'
import { splitEntryOf, isSplitJob } from '@/lib/chargeSplit'
import { type MultiCleanerPaymentInfo, getMultiCleanerPaymentInfo } from '@/lib/excelSheet/rows'

/** CODE-A01: Sheet settings: drafts, column presets, row ids, team money labels, local storage (moved from pages/JobSheetSpreadsheet.tsx) */

export const DRAFT_PREFIX = 'safaeewala_excel_draft:' // local only, never cloud-synced

/** Column presets (UX-39) — the columns each preset shows */
export const COLUMN_PRESETS: Record<string, string[] | null> = {
  'All columns': null,
  Cashier: ['staff_name', 'team_name', 'address', 'material', 'charges', 'received', 'pending', 'payment_mode', 'remarks'],
  Payroll: ['staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'attendance', 'remarks'],
  Ops: ['staff_name', 'team_name', 'start_time', 'end_time', 'address', 'area', 'material', 'remarks'],
}
/** Columns that are calculated, never typed into */
export const READ_ONLY_COLS = new Set(['pending', 'advance', 'ot_hours', 'attendance']) // ot_hours: always automatic (DEC-015); attendance: own dropdown (R-ATT-10)
/** UX-70: a row is white unless it is part of a team project (UX-66) or a colour was chosen for it */
export const DEFAULT_ROW_BG = '#ffffff'
/** UX-66: the project (location + date) of a team row; null for solo / blank rows */
export function projectKeyOf(r: DailyJob, allRows: DailyJob[]): string | null {
  if (!r.address && !r.start_time && !r.end_time && cleanNum(r.charges) === 0 && cleanNum(r.received) === 0) return null
  const info = getMultiCleanerPaymentInfo(r, allRows)
  if (!info?.isMultiCleaner) return null
  return projectKey(r, info.teamRef)
}

/**
 * R-PAY-05: labels of a team member's money cells. Split Mode → the member's own charges, received and mode;
 * Lump Sum → the money is on the lead row ("Added Team A", "Reference Adnan", "Above").
 */
export const memberEntry = (row: DailyJob) => splitEntryOf(row, row.staff_name || '')

export const getLeadShortName = (lead: string, employees?: Array<{ full_name: string; short_name?: string }>): string => {
  if (!lead) return 'Lead'
  const trimmed = lead.trim()
  if (employees && employees.length > 0) {
    const emp = employees.find(e => e.full_name && e.full_name.trim().toLowerCase() === trimmed.toLowerCase())
    if (emp?.short_name && emp.short_name.trim()) return emp.short_name.trim()
  }
  return trimmed.split(/\s+/)[0] || trimmed
}

export const memberChargesLabel = (row: DailyJob, team: string) => {
  const e = memberEntry(row)
  return e ? `Split ${e.charges}` : (team || 'Team')
}

export const memberReceivedLabel = (row: DailyJob, lead: string, employees?: Array<{ full_name: string; short_name?: string }>) => {
  const e = memberEntry(row)
  const shortName = getLeadShortName(lead, employees)
  return e ? `Collected ${e.received} · Ref ${shortName}` : `REF: ${shortName}`
}
export const memberModeLabel = (row: DailyJob) => memberEntry(row)?.payment_mode || 'Above'
/** R-PAY-05: a team member's money is shown by reference to the lead only in Lump Sum mode; Split Mode rows are plain and editable */
export const refMoney = (mc: MultiCleanerPaymentInfo | null | undefined, row: DailyJob) => Boolean(mc?.isSecondary) && !isSplitJob(row)
/** Columns whose cells open their dropdown on a single click, filled or empty (UX-35) */
export const DROPDOWN_COLS = new Set(['address', 'area', 'material', 'payment_mode', 'start_time', 'end_time'])

/** Time suggestions formatted with explicit AM and PM in 15-minute intervals (07:00 AM – 11:45 PM) */
export const TIME_SUGGESTIONS: string[] = (() => {
  const slots: string[] = []
  for (let m = 7 * 60; m < 24 * 60; m += 15) {
    let hh = Math.floor(m / 60)
    const mm = String(m % 60).padStart(2, '0')
    const mer = hh >= 12 ? 'PM' : 'AM'
    hh = hh % 12 || 12
    slots.push(`${String(hh).padStart(2, '0')}:${mm} ${mer}`)
  }
  return slots
})()
/** Standard Dubai Areas for location selection */
export const DUBAI_AREAS = [
  'Downtown Dubai',
  'Dubai Marina',
  'Business Bay',
  'Jumeirah Village Circle (JVC)',
  'Jumeirah Lake Towers (JLT)',
  'Palm Jumeirah',
  'The Greens',
  'Discovery Gardens',
  'Al Barsha',
  'Dubai Hills Estate',
  'Mirdif',
  'Dubai Silicon Oasis',
  'Motor City',
  'JBR',
  'Damac Hills',
  'Deira',
  'Bur Dubai',
  'Al Furjan',
  'Arabian Ranches'
]
/** Cell editor → datalist id (UX-35) */
export const AUTOCOMPLETE_LIST: Record<string, string> = {
  staff_name: 'xl-staff',
  area: 'xl-area'
}
/** Rows drawn at once in long periods (AUD-56, UX-38) */
export const RENDER_PAGE = 300

export function safeGet<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key)
    return val ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

/** Through safeLocalStorageSet so shared settings (cleaner / cell / column colours) reach the cloud (E2E-18) */
export function safeSet(key: string, value: any) {
  safeLocalStorageSet(key, value)
}

/**
 * R-SHEET-01 (Row Color Uniqueness): a colour chosen for one row (or one cleaner block) cannot be given to another
 * row on the same date — except the rows of the same team job, which share their colour. White / default are free.
 * Returns the first row already using the colour, or null when the colour may be used.
 */
export function rowColorConflict(rows: DailyJob[], targetIds: string[], color: string, teamKeyOf: (r: DailyJob) => string | null): DailyJob | null {
  const c = (color || '').toLowerCase()
  if (!c || c === 'white' || c === 'default' || c === DEFAULT_ROW_BG) return null
  const ids = new Set(targetIds)
  const targets = rows.filter(r => ids.has(r.id))
  if (!targets.length) return null
  const dates = new Set(targets.map(r => r.date || ''))
  const teams = new Set(targets.map(teamKeyOf).filter((k): k is string => !!k))
  return rows.find(r => !ids.has(r.id) && (r.row_color || '').toLowerCase() === c && dates.has(r.date || '')
    && !(teams.size > 0 && teams.has(teamKeyOf(r) || ''))) || null
}
