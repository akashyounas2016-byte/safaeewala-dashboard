import { supabase } from '@/lib/supabase'

/**
 * Cloud copy of business data that used to live only in the browser (AUD-02).
 *
 * Each key below is stored as one JSON value in the Supabase table `app_state`
 * (key text primary key, value jsonb, updated_at timestamptz) — see
 * supabase/migrations/2026-10-27_phase2_sync.sql.
 *
 * - Before the app renders, `pullCloudState()` brings the cloud values into localStorage,
 *   so every screen keeps reading localStorage exactly as before.
 * - Every `safeLocalStorageSet` of one of these keys schedules a push (debounced).
 * - Arrays are merged by `id` (objects by key) when this device has unpushed changes
 *   or syncs for the first time, so nothing recorded offline or on another device is lost.
 *   Trade-off: an item deleted on one device can come back if another device edited the
 *   same list before syncing.
 */

export const CLOUD_SYNCED_KEYS = [
  'safaeewala_monthly_client_payments',
  'safaeewala_daily_pending_items',
  'safaeewala_daily_pending_rcvd_items',
  'safaeewala_daily_advance_items',
  'safaeewala_client_adjustments',
  'safaeewala_cleaner_attendance_overrides',
  'safaeewala_recurring_contracts',
  'safaeewala_deleted_staff',
  'safaeewala_deleted_clients',
  'safaeewala_cash_handovers',
  'safaeewala_expense_budgets',
  'safaeewala_purchase_orders',
  'safaeewala_inventory_usage',
  'safaeewala_closed_days',
  'safaeewala_driver_plans',
] as const

const TABLE = 'app_state'
const META_KEY = 'safaeewala_cloud_state_meta'
export const CLOUD_STATE_EVENT = 'safaeewala:cloud-state'

interface KeyMeta { syncedAt?: string; dirty?: boolean }
type Meta = Record<string, KeyMeta>

export interface CloudStateStatus { unsynced: number; lastError?: string }

let lastError: string | undefined
const timers = new Map<string, number>()

const isSynced = (key: string) => (CLOUD_SYNCED_KEYS as readonly string[]).includes(key)

const readMeta = (): Meta => {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') as Meta } catch { return {} }
}
const writeMeta = (meta: Meta) => {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)) } catch { /* quota — meta is rebuilt next pull */ }
  window.dispatchEvent(new CustomEvent<CloudStateStatus>(CLOUD_STATE_EVENT, { detail: getCloudStateStatus() }))
}
const setKeyMeta = (key: string, patch: KeyMeta) => {
  const meta = readMeta()
  meta[key] = { ...meta[key], ...patch }
  writeMeta(meta)
}

export function getCloudStateStatus(): CloudStateStatus {
  const meta = readMeta()
  return { unsynced: Object.values(meta).filter(m => m.dirty).length, lastError }
}

const readLocal = (key: string): unknown => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
}
const writeLocal = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
}
const isEmpty = (v: unknown) =>
  v === undefined || v === null || (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

/** Union of two values: arrays by `id` (local wins), objects by key (local wins) */
function mergeValues(local: unknown, remote: unknown): unknown {
  if (isEmpty(local)) return remote
  if (isEmpty(remote)) return local
  if (Array.isArray(local) && Array.isArray(remote)) {
    const out = new Map<string, unknown>()
    const keyOf = (item: unknown) =>
      item && typeof item === 'object' && 'id' in item ? `id:${String((item as { id: unknown }).id)}` : `json:${JSON.stringify(item)}`
    remote.forEach(item => out.set(keyOf(item), item))
    local.forEach(item => out.set(keyOf(item), item))
    return Array.from(out.values())
  }
  if (typeof local === 'object' && typeof remote === 'object' && !Array.isArray(local) && !Array.isArray(remote)) {
    return { ...(remote as object), ...(local as object) }
  }
  return local
}

const withTimeout = <T,>(p: PromiseLike<T>, ms: number) =>
  Promise.race([Promise.resolve(p), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

/** Bring cloud values into localStorage. Call once before the app renders. */
export async function pullCloudState(timeoutMs = 2500): Promise<void> {
  try {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).select('key, value, updated_at').in('key', CLOUD_SYNCED_KEYS as unknown as string[]),
      timeoutMs,
    )
    if (error) throw new Error(error.message)
    lastError = undefined
    const rows = new Map((data || []).map(r => [r.key as string, r as { value: unknown; updated_at: string }]))
    const meta = readMeta()

    for (const key of CLOUD_SYNCED_KEYS) {
      const remote = rows.get(key)
      const local = readLocal(key)
      const m = meta[key] || {}
      if (!remote) {
        // Nothing in the cloud yet — upload what this browser has
        if (!isEmpty(local)) meta[key] = { ...m, dirty: true }
        continue
      }
      if (!m.syncedAt || m.dirty) {
        // First sync on this device, or local edits not uploaded yet: keep both sides
        const merged = mergeValues(local, remote.value)
        writeLocal(key, merged)
        const differs = JSON.stringify(merged) !== JSON.stringify(remote.value)
        meta[key] = { syncedAt: remote.updated_at, dirty: differs }
      } else {
        writeLocal(key, remote.value)
        meta[key] = { syncedAt: remote.updated_at, dirty: false }
      }
    }
    writeMeta(meta)
    CLOUD_SYNCED_KEYS.forEach(key => { if (meta[key]?.dirty) schedulePush(key, 0) })
  } catch (err) {
    lastError = `Cloud sync unavailable: ${err instanceof Error ? err.message : String(err)}`
    console.warn('[cloudState]', lastError)
    writeMeta(readMeta())
  }
}

async function push(key: string): Promise<void> {
  try {
    const meta = readMeta()
    // Someone else uploaded since our last sync → merge their version in first
    const { data: remote, error: readErr } = await supabase.from(TABLE).select('value, updated_at').eq('key', key).maybeSingle()
    if (readErr) throw new Error(readErr.message)
    let value = readLocal(key)
    // Compare as instants — Postgres may return the timestamp in a different text format
    if (remote && Date.parse(remote.updated_at) !== Date.parse(meta[key]?.syncedAt || '')) {
      value = mergeValues(value, remote.value)
      writeLocal(key, value)
    }
    const updated_at = new Date().toISOString()
    const { error } = await supabase.from(TABLE).upsert({ key, value: value ?? null, updated_at })
    if (error) throw new Error(error.message)
    lastError = undefined
    setKeyMeta(key, { syncedAt: updated_at, dirty: false })
  } catch (err) {
    lastError = `Not saved to cloud (${key.replace('safaeewala_', '')}): ${err instanceof Error ? err.message : String(err)}`
    console.warn('[cloudState]', lastError)
    setKeyMeta(key, { dirty: true })
  }
}

function schedulePush(key: string, delay = 800) {
  window.clearTimeout(timers.get(key))
  timers.set(key, window.setTimeout(() => { timers.delete(key); void push(key) }, delay))
}

/** Called by safeLocalStorageSet after every successful write */
export function onLocalWrite(key: string) {
  if (!isSynced(key)) return
  setKeyMeta(key, { dirty: true })
  schedulePush(key)
}

/** Retry keys that failed to upload (reconnect / every minute) */
export function retryCloudState() {
  const meta = readMeta()
  Object.entries(meta).forEach(([key, m]) => { if (m.dirty && isSynced(key)) schedulePush(key, 0) })
}
