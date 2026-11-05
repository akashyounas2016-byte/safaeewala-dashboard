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
  Payroll: ['staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'remarks'],
  Ops: ['staff_name', 'team_name', 'start_time', 'end_time', 'address', 'area', 'material', 'remarks'],
}
/** Columns that are calculated, never typed into */
export const READ_ONLY_COLS = new Set(['pending', 'advance', 'ot_hours']) // ot_hours: always automatic (DEC-015)
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
export const memberChargesLabel = (row: DailyJob, team: string) => {
  const e = memberEntry(row)
  return e ? `Split ${e.charges}` : `Added ${team || 'Team'}`
}
export const memberReceivedLabel = (row: DailyJob, lead: string) => {
  const e = memberEntry(row)
  return e ? `Collected ${e.received} · Ref ${lead || 'Lead'}` : `Reference ${lead || 'Lead'}`
}
export const memberModeLabel = (row: DailyJob) => memberEntry(row)?.payment_mode || 'Above'
/** R-PAY-05: a team member's money is shown by reference to the lead only in Lump Sum mode; Split Mode rows are plain and editable */
export const refMoney = (mc: MultiCleanerPaymentInfo | null | undefined, row: DailyJob) => Boolean(mc?.isSecondary) && !isSplitJob(row)
/** Columns whose cells open their dropdown on a single click, filled or empty (UX-35) */
export const DROPDOWN_COLS = new Set(['address', 'area', 'material', 'payment_mode', 'start_time', 'end_time'])
/** Time suggestions formatted with explicit AM and PM */
export const TIME_SUGGESTIONS = [ // working day 9:00 AM – 11:00 PM
  '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM',
  '08:00 PM', '08:30 PM',
  '09:00 PM', '09:30 PM',
  '10:00 PM', '10:30 PM',
  '11:00 PM'
]
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
