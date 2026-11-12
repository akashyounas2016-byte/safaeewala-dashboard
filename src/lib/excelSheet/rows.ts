import { checkTimesOverlap } from '@/components/dailyJobSheet/jobSheetUtils'
import type { DailyJob } from '@/types'
import { recalculateAllRowsOT, cleanNum, calcHours, calcOTHours, parseTimeToMinutes } from '@/components/dailyJobSheet/jobSheetUtils'
import { todayDubai } from '@/lib/dubaiTime'
import { expandTeamJob, uniqueTeamRefs } from '@/lib/excelTeams'
import { normalizeJobAddress, isGenericAddress } from '@/lib/utils'

/** CODE-A01: Grid rows: saved-field comparison, team payment info, 3-row cleaner blocks (moved from pages/JobSheetSpreadsheet.tsx) */

/** Temporary id for a grid row that is not saved yet */
export const newRowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ── Safe save helpers (AUD-49, UX-33, UX-34) ──
export const SAVED_FIELDS = [
  'staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'address', 'area',
  'material', 'charges', 'received', 'payment_mode', 'remarks',
  'charges_per_hour', // UX-138: typed by hand
  'row_color', // R-SYNC-11: a colour change alone is a change to save (it showed 'Nothing to save')
] as const
/**
 * UX-139: Duty Hrs and OT follow the two times. Both times set → worked out; a time removed (`removed`) → both cleared
 * (a removed time must not leave old duty hours behind); one time typed while the other is still empty → unchanged. OT is then redone for the cleaner's day by recalculateAllRowsOT.
 */
export function syncDutyWithTimes<T extends { start_time?: string; end_time?: string; duty_hours?: number; ot_hours?: number }>(row: T, removed = true): T {
  const has = (t?: string) => !!t && t !== '—' && parseTimeToMinutes(t) !== null
  if (has(row.start_time) && has(row.end_time)) {
    return { ...row, duty_hours: Math.round(calcHours(row.start_time!, row.end_time!) * 10) / 10, ot_hours: Math.round(calcOTHours(row.start_time!, row.end_time!) * 10) / 10 }
  }
  return removed ? { ...row, duty_hours: 0, ot_hours: 0 } : row
}

export const NUMERIC_FIELDS = new Set<string>(['duty_hours', 'ot_hours', 'charges', 'received', 'charges_per_hour'])
export const fieldValue = (row: DailyJob, k: (typeof SAVED_FIELDS)[number]) =>
  NUMERIC_FIELDS.has(k) ? cleanNum(row[k]) : String(row[k] ?? '').trim()
/**
 * True when the two rows hold the same saved values.
 * R-SYNC-16: OT is not compared — it is always worked out (DEC-015) and changes on its own when another of the
 * cleaner's shifts changes, which made untouched rows count as "unsaved" and "changed on another screen".
 */
const COMPARED_FIELDS = SAVED_FIELDS.filter(k => k !== 'ot_hours')
export const sameJobRow = (a: DailyJob, b: DailyJob) => COMPARED_FIELDS.every(k => fieldValue(a, k) === fieldValue(b, k))
/**
 * R-SYNC-18: team jobs (one grid row per cleaner) that were deleted on another screen while this sheet had them.
 * Only a job that was loaded from the database can have been deleted elsewhere: a team job just added with
 * Add Job (temporary "new-…" id, not saved yet) is not in the database either and is NOT a conflict —
 * counting it blocked every save of a new 2-cleaner job with "1 row(s) changed on another screen".
 */
export function teamJobsDeletedElsewhere(
  teamJobIds: Iterable<string>,
  loadedIds: { has: (id: string) => boolean },
  liveIds: { has: (id: string) => boolean },
  stillHasDetails: (jobId: string) => boolean,
): string[] {
  return Array.from(teamJobIds).filter(id => loadedIds.has(id) && !liveIds.has(id) && stillHasDetails(id))
}

/** A new grid row the user never filled in — not worth saving */
export const isBlankNewRow = (r: DailyJob) =>
  !String(r.address || '').trim() && !String(r.area || '').trim() && cleanNum(r.charges) === 0 &&
  cleanNum(r.received) === 0 && !String(r.remarks || '').trim()

const realTime = (t: unknown) => { const s = String(t ?? '').trim(); return s !== '' && s !== '—' && s !== '-' }
/**
 * R-SYNC-17: a row whose job details were all removed (Delete Row on a cleaner's 3 fixed rows, Clear Row
 * Contents, or every cell cleared). Only the cleaner's name may be left. A saved job in this state is
 * deleted on save — it no longer stays on the Daily Job Sheet as an empty job.
 */
export const isClearedRow = (r: DailyJob) => isBlankNewRow(r) && !realTime(r.start_time) && !realTime(r.end_time)

export interface MultiCleanerPaymentInfo {
  isMultiCleaner: boolean
  isPrimary: boolean
  isSecondary: boolean
  primaryCleaner: string
  teamRef: string
  allCleaners: string[]
}

/**
 * Multi-Cleaner Payment Referencing Helper:
 * If multiple cleaners are assigned to the same address on that date:
 * - Primary cleaner row holds full charges & received payment.
 * - Secondary cleaner rows show reference to primary cleaner & team (e.g. "Included (Team A)", "Team A (Ref: Adnan)").
 */
export function getMultiCleanerPaymentInfo(row: DailyJob | undefined, allRows: DailyJob[]): MultiCleanerPaymentInfo | null {
  if (!row) return null

  // 1. Explicitly flagged secondary cleaner split shift
  if ((row as any)._isSecondaryCleaner) {
    return {
      isMultiCleaner: true,
      isPrimary: false,
      isSecondary: true,
      primaryCleaner: (row as any)._primaryCleanerName || 'Primary Cleaner',
      teamRef: (row as any)._teamReference || row.team_name || 'Team A',
      allCleaners: (row as any)._allCleaners || [],
    }
  }

  // 2. Identify shared address shifts on the same date with overlapping hours
  // Must have a specific, non-generic address and defined shift start & end times
  const normAddr = normalizeJobAddress(row.address)
  if (!normAddr || isGenericAddress(row.address) || !row.start_time || !row.end_time) {
    if ((row as any)._isPrimaryCleaner) {
      return {
        isMultiCleaner: true,
        isPrimary: true,
        isSecondary: false,
        primaryCleaner: row.staff_name,
        teamRef: (row as any)._teamReference || row.team_name || 'Team A',
        allCleaners: (row as any)._allCleaners || [row.staff_name],
      }
    }
    return null
  }

  const rowDate = row.date || todayDubai()
  // Cleaners must share the EXACT specific address and their working hours must OVERLAP
  const matchingRows = allRows.filter(r => {
    if (!r.staff_name || !r.staff_name.trim()) return false
    const rDate = r.date || todayDubai()
    if (rDate !== rowDate) return false
    const rNorm = normalizeJobAddress(r.address)
    if (rNorm !== normAddr) return false
    if (!r.start_time || !r.end_time) return false
    return checkTimesOverlap(row.start_time, row.end_time, r.start_time, r.end_time)
  })

  if (matchingRows.length <= 1) {
    if ((row as any)._isPrimaryCleaner) {
      return {
        isMultiCleaner: true,
        isPrimary: true,
        isSecondary: false,
        primaryCleaner: row.staff_name,
        teamRef: (row as any)._teamReference || row.team_name || 'Team A',
        allCleaners: (row as any)._allCleaners || [row.staff_name],
      }
    }
    return null
  }

  // Distinct cleaner names at this address & time
  const cleanerNames = Array.from(new Set(matchingRows.map(r => (r.staff_name || '').trim()))).filter(Boolean)
  if (cleanerNames.length <= 1) {
    if ((row as any)._isPrimaryCleaner) {
      return {
        isMultiCleaner: true,
        isPrimary: true,
        isSecondary: false,
        primaryCleaner: row.staff_name,
        teamRef: (row as any)._teamReference || row.team_name || 'Team A',
        allCleaners: (row as any)._allCleaners || [row.staff_name],
      }
    }
    return null
  }

  // Primary cleaner row: either has _isPrimaryCleaner, positive charges/received, or first row in sequence
  const primaryRow =
    matchingRows.find(r => (r as any)._isPrimaryCleaner) ||
    matchingRows.find(r => cleanNum(r.charges) > 0 || cleanNum(r.received) > 0) ||
    matchingRows[0]

  const isPrimary = row.id === primaryRow.id

  // Determine unique deterministic team reference for this specific address cluster
  let teamRef = (primaryRow.team_name || row.team_name || '').trim()
  if (!teamRef || teamRef.toLowerCase() === 'project team') {
    const dateClusters: string[] = []
    allRows.forEach(r => {
      const a = normalizeJobAddress(r.address)
      if (!a || isGenericAddress(r.address) || !r.start_time || !r.end_time) return
      if ((r.date || todayDubai()) !== rowDate) return
      if (!dateClusters.includes(a)) dateClusters.push(a)
    })
    dateClusters.sort()
    const cIdx = dateClusters.indexOf(normAddr)
    const letter = String.fromCharCode(65 + ((cIdx >= 0 ? cIdx : 0) % 26))
    teamRef = `Team ${letter}`
  }

  return {
    isMultiCleaner: true,
    isPrimary,
    isSecondary: !isPrimary,
    primaryCleaner: primaryRow.staff_name || 'Primary Cleaner',
    teamRef,
    allCleaners: cleanerNames,
  }
}

/** Ensures that every staff member present in the job list has at least 3 fixed rows (padded with blank shift rows) */
export function ensureThreeRowsPerStaff(jobs: DailyJob[], targetDate: string): DailyJob[] {
  if (jobs.length === 0) {
    return [0, 1, 2].map(() => ({
      id: newRowId('new_cleaner'),
      date: targetDate,
      staff_name: '',
      team_name: '',
      start_time: '',
      end_time: '',
      duty_hours: 0,
      ot_hours: 0,
      address: '',
      area: '',
      material: '' as any,
      charges: 0,
      received: 0,
      payment_mode: '' as any,
      remarks: '',
      is_overtime: false,
      created_at: new Date().toISOString(),
    }))
  }

  // 1. Team names of multi-cleaner jobs, unique per date (UX-66): two teams never share "Team A" that day
  const multiCleanerTeamMap = uniqueTeamRefs(jobs)

  // 2. Expand multi-cleaner jobs into separate rows for each cleaner
  // Primary cleaner holds the charges & received amount so figures are accurate and not duplicated.
  // Secondary cleaners hold 0 charges/received and display team & primary cleaner references.
  const expandedJobs: DailyJob[] = []
  jobs.forEach(job => {
    const teamRef = multiCleanerTeamMap.get(job.id) || (job.team_name && job.team_name.trim().toLowerCase() !== 'project team' ? job.team_name.trim() : 'Team A')
    expandedJobs.push(...expandTeamJob(job, teamRef))
  })

  // 3. Group expanded jobs by individual staff member
  const staffGroups = new Map<string, DailyJob[]>()
  const rawStaffKeysOrder: string[] = []

  expandedJobs.forEach(job => {
    const key = (job.staff_name || '').trim().toLowerCase()
    if (!staffGroups.has(key)) {
      staffGroups.set(key, [])
      rawStaffKeysOrder.push(key)
    }
    staffGroups.get(key)!.push(job)
  })

  // Map cleaners to teams so cleaners of the same team are placed consecutively (upar neechey sequence mein)
  const cleanerToTeamMap = new Map<string, string>()
  const teamToCleanersMap = new Map<string, string[]>()
  expandedJobs.forEach(job => {
    const rawCleaner = (job.staff_name || '').trim().toLowerCase()
    const teamRef = (job as any)._teamReference || (job.team_name && job.team_name.trim().toLowerCase() !== 'project team' ? job.team_name.trim() : '')
    if (rawCleaner && teamRef) {
      cleanerToTeamMap.set(rawCleaner, teamRef)
      if (!teamToCleanersMap.has(teamRef)) teamToCleanersMap.set(teamRef, [])
      if (!teamToCleanersMap.get(teamRef)!.includes(rawCleaner)) {
        teamToCleanersMap.get(teamRef)!.push(rawCleaner)
      }
    }
  })

  // Sequence staff keys: When any team member is encountered, place all fellow team members immediately after
  const staffKeysOrder: string[] = []
  const placedStaffKeys = new Set<string>()

  rawStaffKeysOrder.forEach(key => {
    if (placedStaffKeys.has(key)) return
    const team = cleanerToTeamMap.get(key)
    if (team && teamToCleanersMap.has(team)) {
      const members = teamToCleanersMap.get(team)!
      members.forEach(m => {
        if (!placedStaffKeys.has(m) && staffGroups.has(m)) {
          staffKeysOrder.push(m)
          placedStaffKeys.add(m)
        }
      })
    } else {
      staffKeysOrder.push(key)
      placedStaffKeys.add(key)
    }
  })

  const isBlank = (r: DailyJob) =>
    !r.address && !r.start_time && !r.end_time && cleanNum(r.charges) === 0 && cleanNum(r.received) === 0 && !r.remarks

  const result: DailyJob[] = []
  staffKeysOrder.forEach(key => {
    const list = staffGroups.get(key)!
    const repName = list.find(j => (j.staff_name || '').trim())?.staff_name || ''
    
    // Separate real jobs from blank placeholder shifts
    const realJobs = list.filter(j => !isBlank(j))
    const blankJobs = list.filter(isBlank)

    // Keep all real jobs
    const finalStaffRows: DailyJob[] = [...realJobs]

    // Strictly limit default rows to 3 rows per cleaner
    while (finalStaffRows.length < 3) {
      const existingBlank = blankJobs.shift()
      if (existingBlank) {
        finalStaffRows.push(existingBlank)
      } else {
        finalStaffRows.push({
          id: newRowId(`blank_${key || 'unassigned'}`),
          date: targetDate,
          staff_name: repName,
          team_name: '',
          start_time: '',
          end_time: '',
          duty_hours: 0,
          ot_hours: 0,
          address: '',
          area: '',
          material: '' as any,
          charges: 0,
          received: 0,
          payment_mode: '' as any,
          remarks: '',
          is_overtime: false,
          created_at: new Date().toISOString(),
        })
      }
    }
    result.push(...finalStaffRows)
  })

  // R-OT-01: Automatically calculate cumulative multi-shift Overtime across each cleaner's shifts
  return recalculateAllRowsOT(result)
}

/**
 * R-ATT-09: every cleaner is listed on a one-day sheet. A cleaner with no job that day gets an empty block of 3 rows
 * (marked _idle: 'Available' or 'Absent'). Empty rows are never saved (isBlankNewRow) — typing a job into one saves it.
 */
export function withIdleCleaners(rows: DailyJob[], idle: { name: string; status: 'Available' | 'Absent' }[], targetDate: string): DailyJob[] {
  const named = new Set(rows.map(r => String(r.staff_name || '').trim().toLowerCase()).filter(Boolean))
  const extra: DailyJob[] = []
  idle.forEach(({ name, status }) => {
    if (named.has(name.trim().toLowerCase())) return
    for (let i = 0; i < 3; i++) {
      extra.push({
        id: newRowId(`idle_${name.replace(/\W+/g, '_')}_${i}`), date: targetDate, staff_name: name, team_name: '',
        start_time: '', end_time: '', duty_hours: 0, ot_hours: 0, address: '', area: '', material: '' as any,
        charges: 0, received: 0, payment_mode: '' as any, remarks: '', is_overtime: false, created_at: new Date().toISOString(),
        _idle: status,
      } as DailyJob)
    }
  })
  return extra.length ? [...rows, ...extra] : rows
}
