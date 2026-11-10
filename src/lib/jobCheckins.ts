import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * R-DUTY-01 — job progress from My Duties: On my way → Started → Done, or an Issue for the office.
 * One row per job and cleaner in public.job_checkins (migration 2026-11-04_job_checkins.sql), with the
 * time of each step and the phone's position when allowed. Live for every office screen.
 */
export type CheckinStatus = 'on_way' | 'started' | 'done' | 'issue'

export interface JobCheckin {
  id: string
  job_id: string
  date: string
  cleaner: string
  employee_id?: string | null
  status: CheckinStatus
  on_way_at?: string | null
  started_at?: string | null
  done_at?: string | null
  note?: string | null
  lat?: number | null
  lng?: number | null
  updated_at: string
}

export const checkinId = (jobId: string, cleaner: string) => `${jobId}|${cleaner.trim().toLowerCase()}`

export const CHECKIN_LABEL: Record<CheckinStatus, string> = { on_way: 'On the way', started: 'Started', done: 'Done', issue: 'Issue reported' }

/** The next step a cleaner can take from the current one */
export function nextStep(status?: CheckinStatus): CheckinStatus | null {
  if (!status) return 'on_way'
  if (status === 'on_way') return 'started'
  if (status === 'started' || status === 'issue') return 'done'
  return null
}

/** Phone position, if the user allows it within a few seconds (never blocks the update) */
function position(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), 6000)
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { clearTimeout(t); resolve(null) },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    )
  })
}

/** R-BK-04: check-ins of several dates (the Bookings screen), kept live — read only */
export function useJobCheckinsFor(dates: string[]) {
  const key = [...new Set(dates)].sort().join(',')
  const [rows, setRows] = useState<Record<string, JobCheckin>>({})
  useEffect(() => {
    if (!key) return
    let alive = true
    const list = key.split(',')
    void supabase.from('job_checkins').select('*').in('date', list).then(({ data, error }) => {
      if (alive && !error) setRows(Object.fromEntries(((data ?? []) as JobCheckin[]).map(r => [r.id, r])))
    })
    const channel = supabase.channel(`crm-job-checkins-bookings-${Math.random().toString(36).slice(2, 9)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'job_checkins' }, payload => {
      const row = payload.new as JobCheckin | undefined
      if (alive && row?.id && list.includes(row.date)) setRows(prev => ({ ...prev, [row.id]: row }))
    })
    channel.subscribe()
    return () => { alive = false; void supabase.removeChannel(channel) }
  }, [key])
  return rows
}

/** The furthest step of a job's cleaners: done > started > on the way > issue (null = none yet) */
export function jobProgress(rows: Record<string, JobCheckin>, jobIds: string[]): CheckinStatus | null {
  const mine = Object.values(rows).filter(r => jobIds.includes(r.job_id))
  for (const s of ['done', 'started', 'on_way', 'issue'] as const) if (mine.some(r => r.status === s)) return s
  return null
}

/** Check-ins of one date, kept live. `ready` is false when the table does not exist yet. */
export function useJobCheckins(date: string) {
  const [rows, setRows] = useState<Record<string, JobCheckin>>({})
  const [ready, setReady] = useState(true)

  useEffect(() => {
    let alive = true
    void supabase.from('job_checkins').select('*').eq('date', date).then(({ data, error }) => {
      if (!alive) return
      if (error) { setReady(false); return }
      setReady(true)
      setRows(Object.fromEntries(((data ?? []) as JobCheckin[]).map(r => [r.id, r])))
    })
    const channel = supabase.channel(`crm-job-checkins-${date}-${Math.random().toString(36).slice(2, 9)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'job_checkins', filter: `date=eq.${date}` }, payload => {
      const row = payload.new as JobCheckin | undefined
      if (alive && row?.id) setRows(prev => ({ ...prev, [row.id]: row }))
    })
    channel.subscribe()
    return () => { alive = false; void supabase.removeChannel(channel) }
  }, [date])

  const update = async (job: { id: string; date: string }, cleaner: string, employeeId: string | undefined, status: CheckinStatus, note?: string): Promise<string | null> => {
    const id = checkinId(job.id, cleaner)
    const now = new Date().toISOString()
    const prev = rows[id]
    const pos = await position()
    const row: JobCheckin = {
      ...prev,
      id, job_id: job.id, date: job.date, cleaner, employee_id: employeeId ?? prev?.employee_id ?? null,
      status,
      on_way_at: status === 'on_way' ? now : prev?.on_way_at ?? null,
      started_at: status === 'started' ? now : prev?.started_at ?? null,
      done_at: status === 'done' ? now : prev?.done_at ?? null,
      note: note ?? prev?.note ?? null,
      lat: pos?.lat ?? prev?.lat ?? null,
      lng: pos?.lng ?? prev?.lng ?? null,
      updated_at: now,
    }
    setRows(r => ({ ...r, [id]: row }))
    const { error } = await supabase.from('job_checkins').upsert(row)
    if (error) { setRows(r => (prev ? { ...r, [id]: prev } : Object.fromEntries(Object.entries(r).filter(([k]) => k !== id)))); return error.message }
    return null
  }

  return { rows, ready, update }
}
