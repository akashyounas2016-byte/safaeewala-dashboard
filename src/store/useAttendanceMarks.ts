import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { dbInsert, dbDelete, applyOutbox } from '@/lib/syncQueue'
import { subscribeAttendanceMarks } from '@/lib/realtime'
import { markToRow, rowToMark, type AttendanceMarkRow, type AttendanceOverride } from '@/lib/attendance'

/** Old home of the marks: one shared JSON value in app_state (cloud-synced key) */
export const LEGACY_ATTENDANCE_KEY = 'safaeewala_cleaner_attendance_overrides'
/** This browser's copy of the attendance_marks table (offline / fast start) */
const CACHE_KEY = 'safaeewala_attendance_marks'
const TABLE = 'attendance_marks'

export type AttendanceMarks = Record<string, AttendanceOverride>
export interface AttendanceMarkChange { key: string; mark: AttendanceOverride | null; cleanerName?: string }

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message || ''))

/**
 * Attendance marks (Present / Absent / Leave and leave approvals) — R-SYNC-10, R-ATT-05.
 * Each cleaner + date is one row of `attendance_marks`, saved through the outbox and sent live to
 * every user, so two people marking at once no longer undo each other.
 * Until migration 2026-11-03_attendance_marks.sql has run, the marks stay in the old shared
 * app_state value (legacy mode), exactly as before.
 */
export function useAttendanceMarks() {
  const [marks, setMarks] = useState<AttendanceMarks>(() => {
    const cached = safeLocalStorageGet<AttendanceMarks | null>(CACHE_KEY, null)
    return cached ?? safeLocalStorageGet<AttendanceMarks>(LEGACY_ATTENDANCE_KEY, {})
  })
  // Latest marks for handlers and the live channel; commit() keeps it in step with the state
  const marksRef = useRef(marks)
  // 'table' until the table turns out to be missing
  const modeRef = useRef<'table' | 'legacy'>('table')
  const [ready, setReady] = useState(false)

  const commit = (next: AttendanceMarks) => {
    marksRef.current = next
    setMarks(next)
    if (modeRef.current === 'legacy') safeLocalStorageSet(LEGACY_ATTENDANCE_KEY, next)
    else safeLocalStorageSet(CACHE_KEY, next)
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      const rows: AttendanceMarkRow[] = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from(TABLE).select('*').order('date', { ascending: false }).range(from, from + PAGE - 1)
        if (!alive) return
        if (error) {
          if (isMissingTable(error)) {
            // Migration not run yet: keep using the shared app_state value
            modeRef.current = 'legacy'
            commit(safeLocalStorageGet<AttendanceMarks>(LEGACY_ATTENDANCE_KEY, {}))
          }
          // Other errors (offline / timeout): keep this browser's copy; changes wait in the outbox
          setReady(true)
          return
        }
        rows.push(...((data ?? []) as AttendanceMarkRow[]))
        if (!data || data.length < PAGE) break
      }
      const next: AttendanceMarks = {}
      applyOutbox(TABLE, rows).forEach(r => { next[r.id] = rowToMark(r as AttendanceMarkRow) })
      commit(next)
      setReady(true)
    })()
    return () => { alive = false }
  }, [])

  // Other users' marks and approvals arrive live (R-SYNC-09)
  useEffect(() => {
    if (!ready || modeRef.current !== 'table') return
    return subscribeAttendanceMarks((event, row) => {
      const next = { ...marksRef.current }
      if (event === 'DELETE') {
        if (!(row.id in next)) return
        delete next[row.id]
      } else {
        next[row.id] = rowToMark(row as unknown as AttendanceMarkRow)
      }
      commit(next)
    })
  }, [ready])

  /** Set or remove marks; several at once (e.g. drop an old name-keyed mark and write the id-keyed one) */
  const saveAttendanceMarks = (changes: AttendanceMarkChange[]) => {
    const prev = marksRef.current
    const next = { ...prev }
    changes.forEach(({ key, mark }) => {
      if (mark) next[key] = mark
      else delete next[key]
    })
    commit(next)
    if (modeRef.current === 'legacy') return
    changes.forEach(({ key, mark, cleanerName }) => {
      if (mark) dbInsert(TABLE, markToRow(key, mark, cleanerName) as unknown as { id: string })
      else if (key in prev) dbDelete(TABLE, key)
    })
  }

  return { attendanceMarks: marks, saveAttendanceMarks }
}
