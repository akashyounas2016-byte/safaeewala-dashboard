import type { DailyJob } from '@/types'

/** CODE-A01: Columns of the Excel Job Sheet grid, date presets and pick lists (moved from pages/JobSheetSpreadsheet.tsx) */

/* ─── Column Schema for the Excel Grid (Daily Job Sheet Exact Sequence) ─── */
export interface ColumnDef {
  col: string       // Excel letter: A, B, C...
  id: keyof DailyJob | 'pending' | 'advance' | 'row_num' | 'attendance' | 'charges_per_hour'
  label: string
  width: string
  type: 'text' | 'time' | 'date' | 'number' | 'select' | 'formula'
  options?: string[]
  formulaHint?: string
}

export function isAddressMonthly(val: unknown): boolean {
  if (!val) return false
  return /\(Monthly\)|\[Monthly\]|\bMonthly Client\b/i.test(String(val))
}

export const DEFAULT_COLUMN_DEFS: Omit<ColumnDef, 'col'>[] = [
  { id: 'staff_name',   label: 'Staff',      width: '150px', type: 'text',   formulaHint: 'Staff member name & team' },
  { id: 'start_time',   label: 'Start time', width: '100px', type: 'time',   formulaHint: 'e.g. 10:00 AM' },
  { id: 'end_time',     label: 'End time',   width: '100px', type: 'time',   formulaHint: 'e.g. 03:00 PM' },
  { id: 'address',      label: 'Address',    width: '230px', type: 'text',   formulaHint: 'Client name & address' },
  { id: 'area',         label: 'Location',   width: '125px', type: 'text',   formulaHint: 'Area or location' },
  { id: 'material',     label: 'Material',   width: '120px', type: 'select', options: ['Yes', 'No', 'Sofa'] },
  { id: 'charges',      label: 'Charges',    width: '95px',  type: 'number', formulaHint: 'Gross charges' },
  // UX-138: fee per hour, typed by hand (was worked out from Charges ÷ Duty Hrs, UX-134)
  { id: 'charges_per_hour', label: 'Charges (hrs)', width: '95px', type: 'number', formulaHint: 'Charges per hour (typed)' },
  { id: 'received',     label: 'Received',   width: '95px',  type: 'number', formulaHint: 'Amount received' },
  { id: 'pending',      label: 'Pending',    width: '95px',  type: 'formula', formulaHint: 'Pending amount' },
  { id: 'advance',      label: 'Advance',    width: '95px',  type: 'formula', formulaHint: 'Paid more than the charges (UX-72)' },
  { id: 'duty_hours',   label: 'Duty Hrs',   width: '85px',  type: 'number', formulaHint: 'Duty hours' },
  { id: 'ot_hours',     label: 'OT',         width: '80px',  type: 'number', formulaHint: 'Overtime hours' },
  { id: 'payment_mode', label: 'Mode',       width: '95px',  type: 'select', options: ['Cash', 'Online', 'Monthly', 'Pending'] },
  // R-ATT-10: the cleaner's attendance that day (not a job field — saved in the attendance marks)
  { id: 'attendance',   label: 'Attendance', width: '120px', type: 'select', formulaHint: 'Present / Absent / Short Leave' },
  { id: 'remarks',      label: 'Remarks',    width: '160px', type: 'text',   formulaHint: 'Remarks & notes' },
]

/** Columns added in a later version go after the column that precedes them by default (UX-72: Advance after Pending) */
/** UX-138: the typed Charges (hrs) value of the row (0 when empty) — no longer worked out */
export function chargesPerHour(r: { charges_per_hour?: unknown }): number {
  const v = Number(r.charges_per_hour)
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function mergeNewColumns(ids: string[], defaults: string[]) {
  defaults.forEach((id, i) => {
    if (ids.includes(id)) return
    const after = i > 0 ? ids.indexOf(defaults[i - 1]) : -1
    if (after >= 0) ids.splice(after + 1, 0, id)
    else ids.push(id)
  })
}

export function buildColumnsWithLetters(order: string[], hiddenIds: string[] = []): ColumnDef[] {
  const map = new Map<string, Omit<ColumnDef, 'col'>>(DEFAULT_COLUMN_DEFS.map(c => [c.id, c]))
  const validIds = order.filter(id => map.has(id) && id !== 'date' && id !== 'service' && id !== 'team_name')
  mergeNewColumns(validIds, DEFAULT_COLUMN_DEFS.map(c => c.id))
  const visibleIds = validIds.filter(id => !hiddenIds.includes(id))
  return visibleIds.map((id, idx) => {
    const def = map.get(id)!
    const colLetter = idx < 26
      ? String.fromCharCode(65 + idx)
      : String.fromCharCode(65 + Math.floor(idx / 26) - 1) + String.fromCharCode(65 + (idx % 26))
    return {
      ...def,
      col: colLetter
    }
  })
}

export const COLUMNS: ColumnDef[] = buildColumnsWithLetters(DEFAULT_COLUMN_DEFS.map(c => c.id))

export type ExcelDatePresetKey =
  | 'today'
  | 'yesterday'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_year'
  | 'two_years'
  | 'custom'
  | 'all'

export const EXCEL_DATE_PRESETS: { id: ExcelDatePresetKey; label: string; desc?: string }[] = [
  { id: 'today',         label: 'Today',         desc: 'Dubai current date' },
  { id: 'yesterday',     label: 'Yesterday',     desc: 'Previous day' },
  { id: 'last_month',    label: 'Last Month',    desc: 'Full previous calendar month' },
  { id: 'last_3_months', label: 'Last 3 Months', desc: 'Past 90 days to today' },
  { id: 'last_6_months', label: 'Last 6 Months', desc: 'Past 180 days to today' },
  { id: 'last_year',     label: 'Last Year',     desc: 'Past 365 days to today' },
  { id: 'two_years',     label: '2 Years',       desc: 'Past 2 years to today' },
  { id: 'custom',        label: 'Custom Range',  desc: 'Pick custom start & end date' },
  { id: 'all',           label: 'All',           desc: 'All available records' },
]
