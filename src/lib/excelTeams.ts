import type { DailyJob } from '@/types'
import { splitStaffNames } from '@/lib/clientDataSync'
import { cleanNum } from '@/components/dailyJobSheet/jobSheetUtils'
import { normalizeJobAddress, isGenericAddress } from '@/lib/utils'

/**
 * Team jobs in the Excel Job Sheet (R-SYNC-08, UX-66).
 * A job with several cleaners is one saved job but one grid row per cleaner; the lead row holds the
 * money, the others point to it. Every row of one team gets the same team colour.
 */

/** One grid row per cleaner of a job (the lead keeps the job id and the money) */
export function expandTeamJob(job: DailyJob, teamRef: string): DailyJob[] {
  const cleaners = splitStaffNames(job.staff_name || '')
  if (cleaners.length <= 1) return [job]
  const primaryCleaner = (cleaners[0] || '').trim()
  return cleaners.map((cleaner, cIdx) => {
    const isPrimary = cIdx === 0
    return {
      ...job,
      id: isPrimary ? job.id : `${job.id}-cleaner-${(cleaner || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      staff_name: (cleaner || '').trim(),
      team_name: teamRef,
      charges: isPrimary ? cleanNum(job.charges) : 0,
      received: isPrimary ? cleanNum(job.received) : 0,
      payment_mode: isPrimary ? job.payment_mode : ('Above' as DailyJob['payment_mode']),
      _isSplitShift: true,
      _isPrimaryCleaner: isPrimary,
      _isSecondaryCleaner: !isPrimary,
      _primaryCleanerName: primaryCleaner,
      _teamReference: teamRef,
      _allCleaners: cleaners,
      _cleanerIndex: cIdx + 1,
      _originalJobId: job.id,
    } as DailyJob
  })
}

/** First "Team X" letter not used on that date in the grid */
export function nextTeamRef(rows: DailyJob[], date: string): string {
  const used = new Set(rows
    .filter(r => (r.date || '') === date)
    .map(r => String((r as { _teamReference?: string })._teamReference || r.team_name || '').trim().toUpperCase()))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const l of letters) if (!used.has(`TEAM ${l}`)) return `Team ${l}`
  return `Team ${letters[used.size % letters.length]}${used.size}`
}

const isEmptyShift = (r: DailyJob) =>
  !String(r.address || '').trim() && !r.start_time && !r.end_time && cleanNum(r.charges) === 0 && cleanNum(r.received) === 0

/**
 * Put new rows into the grid like the Daily Job Sheet does: each cleaner's row goes into that
 * cleaner's block (filling an empty shift row first), a cleaner without a block starts one at the top.
 */
export function placeRowsInCleanerBlocks(grid: DailyJob[], newRows: DailyJob[]): DailyJob[] {
  const out = [...grid]
  const top: DailyJob[] = []
  const key = (r: DailyJob) => (r.staff_name || '').trim().toLowerCase()
  newRows.forEach(row => {
    const k = key(row)
    const blank = out.findIndex(r => key(r) === k && isEmptyShift(r))
    if (k && blank >= 0) { out[blank] = row; return }
    let last = -1
    out.forEach((r, i) => { if (k && key(r) === k) last = i })
    if (last >= 0) out.splice(last + 1, 0, row)
    else top.push(row)
  })
  return [...top, ...out]
}

/** Light row colours for teams (none is the solo colour #f0fdfa); `tag` colours the team chip */
export const TEAM_COLORS = [
  { bg: '#fef3c7', tag: '#d97706' }, // amber
  { bg: '#e0e7ff', tag: '#4f46e5' }, // indigo
  { bg: '#fce7f3', tag: '#db2777' }, // pink
  { bg: '#dcfce7', tag: '#16a34a' }, // green
  { bg: '#e0f2fe', tag: '#0284c7' }, // sky
  { bg: '#ede9fe', tag: '#7c3aed' }, // violet
  { bg: '#ffedd5', tag: '#ea580c' }, // orange
  { bg: '#fae8ff', tag: '#c026d3' }, // fuchsia
  { bg: '#ecfccb', tag: '#65a30d' }, // lime
  { bg: '#fee2e2', tag: '#dc2626' }, // red
] as const
export type TeamColor = (typeof TEAM_COLORS)[number]

/**
 * Team key of every team row → colour, in the order teams first appear in the grid, so the same
 * team keeps its colour while the sheet is open. `teamOf` returns "date|Team X" or null for solo rows.
 */
export function buildTeamColorMap(rows: DailyJob[], teamOf: (r: DailyJob) => string | null): Map<string, TeamColor> {
  const map = new Map<string, TeamColor>()
  rows.forEach(r => {
    const k = teamOf(r)
    if (k && !map.has(k)) map.set(k, TEAM_COLORS[map.size % TEAM_COLORS.length])
  })
  return map
}

/**
 * A team name for every multi-cleaner job, unique per date (UX-66): a job keeps its saved name unless
 * another team already uses it that day — then it gets the next free "Team X". Generic names
 * ("Project team", empty) are replaced. Keys are job ids.
 */
export function uniqueTeamRefs(jobs: DailyJob[]): Map<string, string> {
  const usedByDate = new Map<string, Set<string>>()
  const out = new Map<string, string>()
  const used = (date: string) => { if (!usedByDate.has(date)) usedByDate.set(date, new Set()); return usedByDate.get(date)! }
  const teams = jobs.filter(j => splitStaffNames(j.staff_name || '').length > 1)
  const isGeneric = (n: string) => !n || n.toLowerCase() === 'project team'
  // saved names first, in sheet order — the first job keeps a name, a later duplicate is renamed
  const pending: DailyJob[] = []
  teams.forEach(j => {
    const name = String(j.team_name || '').trim()
    const set = used(j.date || '')
    if (!isGeneric(name) && !set.has(name.toUpperCase())) { set.add(name.toUpperCase()); out.set(j.id, name) }
    else pending.push(j)
  })
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  pending.forEach(j => {
    const set = used(j.date || '')
    let name = ''
    for (const l of letters) if (!set.has(`TEAM ${l}`)) { name = `Team ${l}`; break }
    if (!name) name = `Team ${set.size + 1}`
    set.add(name.toUpperCase())
    out.set(j.id, name)
  })
  return out
}

/**
 * A project = the team work at one location on one date (owner, 2026-11-03: "aik location par assign tamaam
 * cleaners aik hi project"). Every team row at the same address that day belongs to it — whatever job or
 * team name it came from — so the Project count, the grouping and the colour all follow the location.
 * Rows without a specific address fall back to their team name. Returns null for a non-team row.
 */
export function projectKey(row: Pick<DailyJob, 'date' | 'address'>, teamRef?: string): string | null {
  const addr = normalizeJobAddress(row.address)
  if (addr && !isGenericAddress(row.address)) return `${row.date || ''}|@${addr}`
  return teamRef ? `${row.date || ''}|${teamRef}` : null
}
