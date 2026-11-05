import type { DailyJob } from '@/types'
import { clashMessage, type StaffClash } from '@/lib/shiftClash'

/**
 * UX-86: issues of a job-sheet row shown as a flag next to the cleaner's name instead of text in Remarks.
 * The monthly / Bi-Weekly sync (R-SCHED-06) records why a visit was added without a cleaner at the end of
 * the remarks: " · ⚠ <cleaner> is already booked <start>–<end> at <site>: assign a cleaner". That note is
 * hidden from the Remarks cell and turned into a flag; the flag also shows a live time clash.
 */

export interface SyncNote { cleaner: string; start: string; end: string; at: string }

const SYNC_NOTE_RE = /\s*·?\s*⚠\s*(.+?) is already booked (.+?)–(.+?) at (.+?): assign a cleaner\s*$/

/** The remarks without the sync note, and the note itself (null when there is none) */
export function splitSyncNote(remarks: unknown): { text: string; note: SyncNote | null } {
  const raw = String(remarks ?? '')
  const m = SYNC_NOTE_RE.exec(raw)
  if (!m) return { text: raw, note: null }
  return { text: raw.slice(0, m.index).trim(), note: { cleaner: m[1].trim(), start: m[2].trim(), end: m[3].trim(), at: m[4].trim() } }
}

export type FlagLevel = 'clash' | 'open' | 'history'

export interface JobFlag {
  level: FlagLevel
  title: string
  detail: string
  /** The row the flag belongs to (its time and site are shown in the popup) */
  row: DailyJob
  /** A sync note that the office may clear */
  clearable: boolean
}

/**
 * Flags of one row:
 *  - clash   (red)   two jobs of one cleaner overlap right now (R-JOB-01)
 *  - open    (amber) the sync added the visit without a cleaner because the scheduled cleaner was busy
 *  - history (grey)  same note, but a cleaner has been assigned since and nothing clashes: only history
 */
export function jobFlags(row: DailyJob, clash: StaffClash | null | undefined): JobFlag[] {
  const flags: JobFlag[] = []
  if (clash) {
    flags.push({ level: 'clash', title: 'Time clash', detail: clashMessage(clash), row, clearable: false })
  }
  const { note } = splitSyncNote(row.remarks)
  if (note) {
    const why = `When the monthly schedule added this visit, ${note.cleaner} (the scheduled cleaner) was already booked ${note.start}–${note.end} at ${note.at}, so the visit was added without a cleaner.`
    if (!String(row.staff_name || '').trim()) {
      flags.push({ level: 'open', title: 'Needs a cleaner', detail: `${why} Assign a cleaner to this row.`, row, clearable: true })
    } else if (!clash) {
      flags.push({
        level: 'history',
        title: 'No time clash now: only history',
        detail: `${why} A cleaner has been assigned since and nothing overlaps, so there is no conflict now. The flag only keeps that history; clear it if it is no longer needed.`,
        row,
        clearable: true,
      })
    }
  }
  return flags
}

/** The worst level of a list of flags (decides the flag colour) */
export function worstFlag(flags: JobFlag[]): FlagLevel | null {
  if (flags.some(f => f.level === 'clash')) return 'clash'
  if (flags.some(f => f.level === 'open')) return 'open'
  return flags.length ? 'history' : null
}
