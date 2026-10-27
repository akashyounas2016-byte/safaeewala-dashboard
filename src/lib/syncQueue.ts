import { supabase } from '@/lib/supabase'
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

const readOutbox = () => safeLocalStorageGet<OutboxEntry[]>(OUTBOX_KEY, [])
const writeOutbox = (list: OutboxEntry[]) => {
  safeLocalStorageSet(OUTBOX_KEY, list)
  const last = [...list].reverse().find(e => e.lastError)
  window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, {
    detail: { pending: list.length, lastError: last?.lastError },
  }))
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
}

/** Drop a stale entry for a row once a newer write for it succeeded */
function settle(table: string, rowId: string) {
  const list = readOutbox()
  const key = `${table}:${rowId}`
  if (list.some(e => e.key === key)) writeOutbox(list.filter(e => e.key !== key))
}

async function run(e: Pick<OutboxEntry, 'table' | 'op' | 'rowId' | 'payload'>): Promise<string | null> {
  try {
    const q = supabase.from(e.table)
    const { error } =
      e.op === 'upsert' ? await q.upsert(e.payload as never) :
      e.op === 'update' ? await q.update(e.payload as never).eq('id', e.rowId) :
                          await q.delete().eq('id', e.rowId)
    return error ? (error.message || String(error)) : null
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
      if (error) list[idx] = { ...list[idx], tries: list[idx].tries + 1, lastError: error }
      else list.splice(idx, 1)
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
    if (readOutbox().length > 0) void flushOutbox()
    retryCloudState()
  }
  window.addEventListener('online', tick)
  const timer = window.setInterval(tick, 60_000)
  tick()
  return () => { window.removeEventListener('online', tick); window.clearInterval(timer) }
}
