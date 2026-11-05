import { checkTimesOverlap } from '@/components/dailyJobSheet/jobSheetUtils'
import type { DailyJob } from '@/types'
import { recalculateAllRowsOT, cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
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
] as const
export const NUMERIC_FIELDS = new Set<string>(['duty_hours', 'ot_hours', 'charges', 'received'])
export const fieldValue = (row: DailyJob, k: (typeof SAVED_FIELDS)[number]) =>
  NUMERIC_FIELDS.has(k) ? cleanNum(row[k]) : String(row[k] ?? '').trim()
/** True when the two rows hold the same saved values */
export const sameJobRow = (a: DailyJob, b: DailyJob) => SAVED_FIELDS.every(k => fieldValue(a, k) === fieldValue(b, k))
/** A new grid row the user never filled in — not worth saving */
export const isBlankNewRow = (r: DailyJob) =>
  !String(r.address || '').trim() && !String(r.area || '').trim() && cleanNum(r.charges) === 0 &&
  cleanNum(r.received) === 0 && !String(r.remarks || '').trim()

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

  const result: DailyJob[] = []
  staffKeysOrder.forEach(key => {
    const list = staffGroups.get(key)!
    const repName = list.find(j => (j.staff_name || '').trim())?.staff_name || ''
    result.push(...list)
    while (list.length < 3) {
      const blankRow: DailyJob = {
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
      }
      list.push(blankRow)
      result.push(blankRow)
    }
  })

  // R-OT-01: Automatically calculate cumulative multi-shift Overtime across each cleaner's shifts
  return recalculateAllRowsOT(result)
}
