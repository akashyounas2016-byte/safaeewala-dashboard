import { supabase } from '@/lib/supabase'
import { reportError } from '@/lib/errorReport'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { retryCloudState } from '@/lib/cloudState'

/**
 * Supabase write outbox (AUD-03, AUD-20).
 *
 * Every insert / update / delete goes through here. If Supabase rejects it (offline, timeout,
 * missing column, permission), the change is kept in a persisted outbox, retried later, and the
 * UI is told how many changes are not yet saved to the cloud. On load, pending changes are
 * re-applied on top of the server rows so a record that never reached Supabase is not lost.
 */

const OUTBOX_KEY = 'safaeewala_sync_outbox'
export const SYNC_STATUS_EVENT = 'safaeewala:sync-status'

type Op = 'upsert' | 'update' | 'delete'

interface OutboxEntry {
  key: string           // `${table}:${rowId}` — later changes to the same row are folded into one entry
  table: string
  op: Op
  rowId: string
  payload?: Record<string, unknown>
  at: string
  tries: number
  lastError?: string
}

export interface SyncStatus {
  pending: number
  lastError?: string
}

const FAILED_KEY = 'safaeewala_sync_failed'
/** R-SYNC-13: room for a long offline day; a change pushed out or given up is kept in FAILED_KEY and reported, never silently lost */
export const OUTBOX_CAP = 300
export const MAX_TRIES = 30
/** No connection / timeout: the change is fine, the network is not — such tries do not count */
export const isTransientError = (message?: string) => /fetch|network|timeout|timed out|load failed|offline|ECONN|503|502|504/i.test(message || '')
const keepFailed = (entries: OutboxEntry[], why: string) => {
  if (entries.length === 0) return
  const prev = safeLocalStorageGet<OutboxEntry[]>(FAILED_KEY, [])
  safeLocalStorageSet(FAILED_KEY, [...prev, ...entries.map(e => ({ ...e, lastError: `${why}: ${e.lastError || ''}` }))].slice(-200))
  entries.forEach(e => reportError(new Error(`${e.op} ${e.table}/${e.rowId} not saved to Supabase (${why}): ${e.lastError || ''}`), 'sync', { table: e.table, op: e.op, rowId: e.rowId }))
}

const readOutbox = () => safeLocalStorageGet<OutboxEntry[]>(OUTBOX_KEY, [])
const writeOutbox = (list: OutboxEntry[]) => {
  const capped = list.length > OUTBOX_CAP ? list.slice(-OUTBOX_CAP) : list
  if (capped.length < list.length) keepFailed(list.slice(0, list.length - OUTBOX_CAP), 'outbox full')
  safeLocalStorageSet(OUTBOX_KEY, capped)
  const last = [...capped].reverse().find(e => e.lastError)
  // UX-105: told after the current render — a write made inside a React state update otherwise updated
  // the sync banner while another component was rendering (React warning on Clients / Employees)
  const detail = { pending: capped.length, lastError: last?.lastError }
  queueMicrotask(() => window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, { detail })))
}

export function getSyncStatus(): SyncStatus {
  const list = readOutbox()
  return { pending: list.length, lastError: [...list].reverse().find(e => e.lastError)?.lastError }
}

/** Fold a new change into the outbox (an update after a pending upsert stays an upsert, a delete wins) */
function enqueue(entry: Omit<OutboxEntry, 'key' | 'at' | 'tries'>, error: string) {
  const list = readOutbox()
  const key = `${entry.table}:${entry.rowId}`
  const idx = list.findIndex(e => e.key === key)
  const next: OutboxEntry = { ...entry, key, at: new Date().toISOString(), tries: 1, lastError: error }
  if (idx >= 0) {
    const prev = list[idx]
    if (entry.op === 'update' && prev.op !== 'delete') {
      next.op = prev.op
      next.payload = { ...prev.payload, ...entry.payload }
    }
    next.tries = prev.tries + 1
    list[idx] = next
  } else {
    list.push(next)
  }
  writeOutbox(list)
  console.error(`[sync] ${entry.op} ${entry.table}/${entry.rowId} not saved to Supabase: ${error}`)
  // R-OPS-07: the database refused the change (not a lost connection) — reported once, when it first fails
  if (next.tries === 1 && !isTransientError(error) && !/earlier unsaved change/i.test(error)) {
    reportError(new Error(`${entry.op} ${entry.table} not saved yet: ${error}`), 'sync', { table: entry.table, op: entry.op, rowId: entry.rowId })
  }
}

/** Known column whitelist for tables that do not have custom UI fields in Supabase */
const DAILY_JOBS_COLUMNS = new Set([
  'id', 'created_at', 'date', 'staff_name', 'start_time', 'end_time',
  'duty_hours', 'ot_hours', 'address', 'area', 'material', 'charges',
  'received', 'payment_mode', 'is_overtime', 'remarks', 'service',
  'booking_id', 'status', 'team_name',
  'charge_split', 'row_color', // migration 2026-11-03_daily_jobs_split_and_color.sql (R-PAY-05, R-SYNC-11)
  'charges_per_hour', // migration 2026-11-11_daily_jobs_charges_per_hour.sql (UX-138)
])

const BOOKINGS_COLUMNS = new Set([
  'id', 'created_at', 'client_id', 'client_name', 'client_phone',
  'service_address', 'service_type', 'status', 'frequency', 'scheduled_date',
  'scheduled_time', 'end_time', 'duration_hours', 'material', 'assigned_crew',
  'notes', 'total_amount', 'source', 'is_sheet_synced', 'received_amount',
  'pending_due', 'is_partially_paid', 'job_sheet_id', 'recurrence_day'
])

export function sanitizeOutboxPayload(table: string, payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return payload
  if (table === 'daily_jobs') {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(payload)) {
      if (DAILY_JOBS_COLUMNS.has(k)) {
        clean[k] = v
      }
    }
    return clean
  }
  if (table === 'bookings') {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(payload)) {
      if (BOOKINGS_COLUMNS.has(k)) {
        clean[k] = v
      }
    }
    return clean
  }
  return payload
}

/** True while this browser has a change for the row that is not in Supabase yet (live updates skip it) */
export function hasPendingWrite(table: string, rowId: string): boolean {
  return readOutbox().some(e => e.key === `${table}:${rowId}`)
}

/** Drop a stale entry for a row once a newer write for it succeeded */
function settle(table: string, rowId: string) {
  const list = readOutbox()
  const key = `${table}:${rowId}`
  if (list.some(e => e.key === key)) writeOutbox(list.filter(e => e.key !== key))
}

async function run(e: Pick<OutboxEntry, 'table' | 'op' | 'rowId' | 'payload'>): Promise<string | null> {
  try {
    let cleanPayload = sanitizeOutboxPayload(e.table, e.payload)
    // A field the database has no column for used to reject the whole row, which then stayed in the
    // outbox for ever. Now that one field is left out, the rest is saved, and the gap is reported so
    // the column can be added (cloud audit 2026-11-01).
    for (let attempt = 0; attempt < 8; attempt++) {
      const q = supabase.from(e.table)
      const { error } =
        e.op === 'upsert' ? await q.upsert(cleanPayload as never) :
        e.op === 'update' ? await q.update(cleanPayload as never).eq('id', e.rowId) :
                            await q.delete().eq('id', e.rowId)
      if (!error) return null
      const message = error.message || String(error)
      const missing = /Could not find the '([^']+)' column/i.exec(message)?.[1]
      if (missing && cleanPayload && missing in cleanPayload && e.op !== 'delete') {
        reportError(new Error(`Supabase has no column ${e.table}.${missing} — that field was not saved`), 'sync', { table: e.table, op: e.op, rowId: e.rowId })
        cleanPayload = { ...cleanPayload }
        delete cleanPayload[missing]
        if (Object.keys(cleanPayload).filter(k => k !== 'id').length === 0) return null
        continue
      }
      return message
    }
    return 'Too many missing columns'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function write(table: string, op: Op, rowId: string, payload?: Record<string, unknown>) {
  // A row with an unsaved earlier change must not skip the queue (an update could "succeed"
  // on a row that was never inserted and wrongly clear the pending insert)
  if (readOutbox().some(e => e.key === `${table}:${rowId}`)) {
    enqueue({ table, op, rowId, payload }, 'Waiting for an earlier unsaved change')
    void flushOutbox()
    return
  }
  void run({ table, op, rowId, payload }).then(error => {
    if (error) enqueue({ table, op, rowId, payload }, error)
    else settle(table, rowId)
  })
}

export const dbInsert = <T extends { id: string }>(table: string, row: T) =>
  write(table, 'upsert', row.id, row as unknown as Record<string, unknown>)
export const dbUpdate = (table: string, id: string, patch: object) =>
  write(table, 'update', id, patch as Record<string, unknown>)
export const dbDelete = (table: string, id: string) => write(table, 'delete', id)

let flushing = false
/** Retry everything in the outbox, oldest first */
export async function flushOutbox(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    for (const entry of readOutbox()) {
      const error = await run(entry)
      const list = readOutbox()
      const idx = list.findIndex(e => e.key === entry.key && e.at === entry.at)
      if (idx < 0) continue
      if (error) {
        // R-SYNC-13: an offline / timeout try does not count; a real rejection is given up after MAX_TRIES and kept + reported
        list[idx] = { ...list[idx], tries: list[idx].tries + (isTransientError(error) ? 0 : 1), lastError: error }
        if (list[idx].tries > MAX_TRIES) keepFailed(list.splice(idx, 1), 'gave up')
      } else {
        list.splice(idx, 1)
      }
      writeOutbox(list)
    }
  } finally {
    flushing = false
  }
}

/** Server rows + changes that have not reached Supabase yet */
export function applyOutbox<T extends { id: string }>(table: string, rows: T[]): T[] {
  const pending = readOutbox().filter(e => e.table === table)
  if (pending.length === 0) return rows
  let result = [...rows]
  for (const e of pending) {
    const idx = result.findIndex(r => r.id === e.rowId)
    if (e.op === 'delete') {
      if (idx >= 0) result.splice(idx, 1)
    } else if (idx >= 0) {
      result[idx] = { ...result[idx], ...(e.payload as Partial<T>) }
    } else if (e.op === 'upsert') {
      result = [e.payload as unknown as T, ...result]
    }
  }
  return result
}

/** Retry on reconnect and every minute while something is pending */
export function startOutboxRetry(): () => void {
  const tick = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return // R-SYNC-13: wait for the connection
    if (readOutbox().length > 0) void flushOutbox()
    retryCloudState()
  }
  window.addEventListener('online', tick)
  const timer = window.setInterval(tick, 60_000)
  tick()
  return () => { window.removeEventListener('online', tick); window.clearInterval(timer) }
}
