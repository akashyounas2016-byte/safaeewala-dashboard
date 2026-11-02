import { supabase } from '@/lib/supabase'
import { hasPendingWrite } from '@/lib/syncQueue'

/**
 * Live updates between users (E2E-17, R-SYNC-09).
 *
 * Several people work in the CRM at the same time. Every insert / update / delete in these tables is
 * pushed by Supabase Realtime to every signed-in browser, which merges it into its data — no reload.
 * A row this browser has an unsaved change for is skipped: the local, newer change wins and is uploaded.
 * Needs migration 2026-11-02_realtime.sql (tables added to the `supabase_realtime` publication).
 */
export const REALTIME_TABLES = [
  'bookings', 'clients', 'employees', 'agencies', 'invoices', 'inventory', 'daily_jobs', 'daily_expenses',
] as const
export type RealtimeTable = (typeof REALTIME_TABLES)[number]
export type RowChange = 'INSERT' | 'UPDATE' | 'DELETE'

export function subscribeTables(onChange: (table: RealtimeTable, event: RowChange, row: Record<string, unknown> & { id: string }) => void): () => void {
  const channel = supabase.channel('crm-tables')
  REALTIME_TABLES.forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      const event = payload.eventType as RowChange
      const row = (event === 'DELETE' ? payload.old : payload.new) as Record<string, unknown> & { id?: string }
      if (!row?.id) return
      if (event !== 'DELETE' && hasPendingWrite(table, row.id)) return
      onChange(table, event, row as Record<string, unknown> & { id: string })
    })
  })
  channel.subscribe()
  return () => { void supabase.removeChannel(channel) }
}

/** Merge one changed row into a list (keeps fields only this browser has, e.g. agency JSON fields) */
export function applyRowChange<T extends { id: string }>(list: T[], event: RowChange, row: Partial<T> & { id: string }): T[] {
  const i = list.findIndex(r => r.id === row.id)
  if (event === 'DELETE') return i < 0 ? list : list.filter(r => r.id !== row.id)
  if (i < 0) return [row as T, ...list]
  const merged = { ...list[i], ...row }
  if (JSON.stringify(merged) === JSON.stringify(list[i])) return list
  const next = [...list]
  next[i] = merged
  return next
}
