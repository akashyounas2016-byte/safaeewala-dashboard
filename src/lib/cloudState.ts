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
 * - R-SYNC-19: a deletion leaves a shared delete marker (TOMBSTONES_KEY: "<key>|<item>" -> "d:<time>"),
 *   and merging leaves marked items out: an item deleted on one device no longer comes back from
 *   another device that still had it. Adding the item again later ("r:<time>", e.g. a restore) wins
 *   over an older marker. Markers are kept 120 days.
 */

/** R-SYNC-19: shared delete markers of the lists below (first in the list: synced before them) */
export const TOMBSTONES_KEY = 'safaeewala_deleted_item_ids'

export const CLOUD_SYNCED_KEYS = [
  TOMBSTONES_KEY,
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
  // settings that used to live in one browser only (cloud audit 2026-11-01)
  'safaeewala_booking_service_types',
  'safaeewala_review_requests',
  'safaeewala_ghl_config',
  'safaeewala_gdrive_webhook_url',
  // E2E-18: shared settings that every user / device must see the same (R-SYNC-07)
  'safaeewala_custom_payment_modes',
  'safaeewala_deleted_payment_modes',
  'safaeewala_job_materials',
  'safaeewala_deleted_drivers',
  'safaeewala_excel_cleaner_colors',
  'safaeewala_excel_cell_colors',
  'safaeewala_excel_column_colors',
  'safaeewala_excel_column_align', // UX-73
  'safaeewala_row_filter_colors_v2',
  'safaeewala_auto_sync_monthly_schedules',
  'safaeewala_removed_monthly_visits', // R-SYNC-17: a deleted monthly visit is not added again on any device
  'safaeewala_excel_block_order', // UX-182: the cleaner blocks' own order on the Excel Job Sheet
  'safaeewala_deleted_materials', // UX-191: materials removed from the dropdowns
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
  // UX-105: after the current render (a save inside a React state update warned in the sync banner)
  queueMicrotask(() => window.dispatchEvent(new CustomEvent<CloudStateStatus>(CLOUD_STATE_EVENT, { detail: getCloudStateStatus() })))
}
const setKeyMeta = (key: string, patch: KeyMeta) => {
  const meta = readMeta()
  meta[key] = { ...meta[key], ...patch }
  writeMeta(meta)
}

export function getCloudStateStatus(): CloudStateStatus {
  const meta = readMeta()
  const unsynced = Object.values(meta).filter(m => m.dirty).length
  // R-APP-05: nothing waiting → no old error left on the banner
  if (unsynced === 0) lastError = undefined
  return { unsynced, lastError }
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

const itemKeyOf = (item: unknown) =>
  item && typeof item === 'object' && 'id' in item ? `id:${String((item as { id: unknown }).id)}` : `json:${JSON.stringify(item)}`
/** Item keys of a list (arrays) or record (objects): what a delete marker points at */
function itemKeys(v: unknown): Set<string> {
  if (Array.isArray(v)) return new Set(v.map(itemKeyOf))
  if (v && typeof v === 'object') return new Set(Object.keys(v as object).map(k => `key:${k}`))
  return new Set()
}

// R-SYNC-19: delete markers
type Tombstones = Record<string, string> // "<storage key>|<item key>" -> "d:<iso>" deleted / "r:<iso>" added again
const markTime = (m?: string) => (m ? Date.parse(m.slice(2)) || 0 : 0)
const isDeletedMark = (m?: string) => Boolean(m && m.startsWith('d:'))
const readTombstones = (): Tombstones => {
  const v = readLocal(TOMBSTONES_KEY)
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Tombstones) : {}
}
/** Markers of two devices: per item the later one wins; older than 120 days dropped */
export function mergeTombstones(a: Tombstones, b: Tombstones, now = Date.now()): Tombstones {
  const out: Tombstones = {}
  const cutoff = now - 120 * 86400000
  for (const src of [a || {}, b || {}]) {
    for (const [k, m] of Object.entries(src)) {
      if (typeof m !== 'string' || markTime(m) < cutoff) continue
      if (!out[k] || markTime(m) > markTime(out[k])) out[k] = m
    }
  }
  return out
}
/** Values last seen per key on this device: a local write is compared with it to find deletions */
const lastSeen = new Map<string, Set<string>>()
const remember = (key: string, v: unknown) => { if (key !== TOMBSTONES_KEY) lastSeen.set(key, itemKeys(v)) }

/** Union of two values: arrays by `id` (local wins), objects by key (local wins); items with a delete marker left out */
export function mergeValues(local: unknown, remote: unknown, key = '', marks: Tombstones = {}): unknown {
  if (key === TOMBSTONES_KEY) return mergeTombstones((local || {}) as Tombstones, (remote || {}) as Tombstones)
  const gone = (itemKey: string) => isDeletedMark(marks[`${key}|${itemKey}`])
  if (isEmpty(local)) return remote
  if (isEmpty(remote)) return local
  if (Array.isArray(local) && Array.isArray(remote)) {
    const out = new Map<string, unknown>()
    remote.forEach(item => out.set(itemKeyOf(item), item))
    local.forEach(item => out.set(itemKeyOf(item), item))
    return Array.from(out.entries()).filter(([k]) => !gone(k)).map(([, v]) => v)
  }
  if (typeof local === 'object' && typeof remote === 'object' && !Array.isArray(local) && !Array.isArray(remote)) {
    const merged = { ...(remote as Record<string, unknown>), ...(local as Record<string, unknown>) }
    return Object.fromEntries(Object.entries(merged).filter(([k]) => !gone(`key:${k}`)))
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
        const merged = mergeValues(local, remote.value, key, readTombstones())
        writeLocal(key, merged)
        const differs = JSON.stringify(merged) !== JSON.stringify(remote.value)
        meta[key] = { syncedAt: remote.updated_at, dirty: differs }
      } else {
        writeLocal(key, remote.value)
        meta[key] = { syncedAt: remote.updated_at, dirty: false }
      }
    }
    writeMeta(meta)
    CLOUD_SYNCED_KEYS.forEach(key => remember(key, readLocal(key)))
    CLOUD_SYNCED_KEYS.forEach(key => { if (meta[key]?.dirty) schedulePush(key, 0) })
  } catch (err) {
    lastError = `Cloud sync unavailable: ${err instanceof Error ? err.message : String(err)}`
    console.warn('[cloudState]', lastError)
    writeMeta(readMeta())
  }
}

/**
 * R-APP-02: a cleaner / driver login may write only the driver plan to app_state (R-SEC-07 policy). Other keys it
 * changes on its phone stay on the phone — no upload, no "changes not saved" banner (14 were stuck on the app).
 */
const FIELD_WRITABLE = new Set(['safaeewala_driver_plans'])
// R-APP-05: remembered on the phone, so the first uploads after opening the app (before the login is known) are
// already held back — they failed and showed "14 changes not saved" on every start
const FIELD_FLAG = 'safaeewala_field_login'
let fieldLogin = (() => { try { return localStorage.getItem(FIELD_FLAG) === '1' } catch { return false } })()
export function setCloudFieldLogin(isField: boolean) {
  try { if (isField) localStorage.setItem(FIELD_FLAG, '1'); else localStorage.removeItem(FIELD_FLAG) } catch { /* private mode */ }
  if (fieldLogin === isField) {
    if (isField) clearFieldDirty()
    return
  }
  fieldLogin = isField
  if (isField) clearFieldDirty()
}
function clearFieldDirty() {
  const meta = readMeta()
  lastError = undefined
  let changed = false
  Object.keys(meta).forEach(k => { if (meta[k]?.dirty && !FIELD_WRITABLE.has(k)) { meta[k] = { ...meta[k], dirty: false }; changed = true } })
  writeMeta(meta) // also tells the banner (even when nothing changed — the old error goes)
  void changed
}

async function push(key: string): Promise<void> {
  if (fieldLogin && !FIELD_WRITABLE.has(key)) { setKeyMeta(key, { dirty: false }); return }
  try {
    // R-SYNC-19: this device's delete markers go up first, so no other device merges a deleted item back
    if (key !== TOMBSTONES_KEY && !fieldLogin && readMeta()[TOMBSTONES_KEY]?.dirty) await push(TOMBSTONES_KEY)
    const meta = readMeta()
    // Someone else uploaded since our last sync → merge their version in first (with everyone's delete markers)
    const { data: rows, error: readErr } = await supabase.from(TABLE).select('key, value, updated_at').in('key', key === TOMBSTONES_KEY ? [key] : [key, TOMBSTONES_KEY])
    if (readErr) throw new Error(readErr.message)
    const remote = (rows || []).find(r => r.key === key) as { value: unknown; updated_at: string } | undefined
    const remoteMarks = (rows || []).find(r => r.key === TOMBSTONES_KEY)?.value as Tombstones | undefined
    if (remoteMarks && key !== TOMBSTONES_KEY) writeLocal(TOMBSTONES_KEY, mergeTombstones(readTombstones(), remoteMarks))
    let value = readLocal(key)
    // Compare as instants — Postgres may return the timestamp in a different text format
    if (remote && Date.parse(remote.updated_at) !== Date.parse(meta[key]?.syncedAt || '')) {
      value = mergeValues(value, remote.value, key, readTombstones())
      writeLocal(key, value)
      remember(key, value)
    }
    const updated_at = new Date().toISOString()
    const { error } = await supabase.from(TABLE).upsert({ key, value: value ?? null, updated_at })
    if (error) throw new Error(error.message)
    lastError = undefined
    setKeyMeta(key, { syncedAt: updated_at, dirty: false })
  } catch (err) {
    // R-APP-05: the login turned out to be a cleaner / driver while this upload ran — keep it on the phone, no error
    if (fieldLogin && !FIELD_WRITABLE.has(key)) { setKeyMeta(key, { dirty: false }); return }
    // the server says this login may not write shared settings (field-login policy) → it is a cleaner / driver
    if (/app_state_field/i.test(String(err)) && !FIELD_WRITABLE.has(key)) { setCloudFieldLogin(true); setKeyMeta(key, { dirty: false }); return }
    lastError = `Not saved to cloud (${key.replace('safaeewala_', '')}): ${err instanceof Error ? err.message : String(err)}`
    console.warn('[cloudState]', lastError)
    setKeyMeta(key, { dirty: true })
  }
}

/** R-SCHED-21: push one key now (not after the 800 ms wait) — e.g. a removal marker that must reach other screens first */
export function pushCloudKeyNow(key: string): Promise<void> {
  window.clearTimeout(timers.get(key))
  timers.delete(key)
  return push(key)
}

function schedulePush(key: string, delay = 800) {
  window.clearTimeout(timers.get(key))
  timers.set(key, window.setTimeout(() => { timers.delete(key); void push(key) }, delay))
}

/** Called by safeLocalStorageSet after every successful write */
export function onLocalWrite(key: string) {
  if (!isSynced(key)) return
  if (key !== TOMBSTONES_KEY) markChanges(key)
  setKeyMeta(key, { dirty: true })
  schedulePush(key)
}

/** R-SYNC-19: no markers for looks / switches (Excel colours, alignment) and the driver plan field logins write */
const NO_MARKERS = new Set(['safaeewala_driver_plans', 'safaeewala_excel_cleaner_colors', 'safaeewala_excel_cell_colors', 'safaeewala_excel_column_colors', 'safaeewala_excel_column_align', 'safaeewala_row_filter_colors_v2', 'safaeewala_auto_sync_monthly_schedules'])
/** R-SYNC-19: items gone since the last value seen get a delete marker; items back again get "added again" */
function markChanges(key: string) {
  if (NO_MARKERS.has(key)) return
  const now = itemKeys(readLocal(key))
  const before = lastSeen.get(key)
  lastSeen.set(key, now)
  if (!before) return // nothing seen yet on this device (cloud not read): no guessing
  const at = new Date().toISOString()
  const marks = readTombstones()
  let changed = false
  before.forEach(k => { if (!now.has(k)) { marks[`${key}|${k}`] = `d:${at}`; changed = true } })
  now.forEach(k => { if (!before.has(k) && isDeletedMark(marks[`${key}|${k}`])) { marks[`${key}|${k}`] = `r:${at}`; changed = true } })
  if (!changed) return
  writeLocal(TOMBSTONES_KEY, mergeTombstones(marks, {}))
  setKeyMeta(TOMBSTONES_KEY, { dirty: true })
  schedulePush(TOMBSTONES_KEY, 0)
}

/** Retry keys that failed to upload (reconnect / every minute) */
export function retryCloudState() {
  const meta = readMeta()
  Object.entries(meta).forEach(([key, m]) => { if (m.dirty && isSynced(key)) schedulePush(key, 0) })
}

/** Fired when another user / device changed a cloud-synced setting while this page is open */
export const REMOTE_CHANGE_EVENT = 'safaeewala:remote-change'

/** Same JSON value, whatever the key order */
export function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canon((v as Record<string, unknown>)[k])])) : v
  try { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)) } catch { return false }
}

/** Live updates of cloud-synced settings (E2E-17, R-SYNC-09) */
export function subscribeCloudState(): () => void {
  const channel = supabase.channel('crm-app-state').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, payload => {
    const row = payload.new as { key?: string; value?: unknown; updated_at?: string }
    if (!row?.key || !isSynced(row.key)) return
    const m = readMeta()[row.key] || {}
    if (row.updated_at && Date.parse(row.updated_at) === Date.parse(m.syncedAt || '')) return // our own upload
    if (m.dirty) { schedulePush(row.key, 0); return } // our unsaved change: the push merges theirs in
    // our own upload coming back before the push had noted its time: same value as here → not another user's change
    // (the database stores JSON with its own key order, so both sides are compared with sorted keys)
    if (sameJson(row.value, readLocal(row.key))) { setKeyMeta(row.key, { syncedAt: row.updated_at, dirty: false }); return }
    writeLocal(row.key, row.value)
    remember(row.key, row.value)
    setKeyMeta(row.key, { syncedAt: row.updated_at, dirty: false })
    window.dispatchEvent(new CustomEvent(REMOTE_CHANGE_EVENT, { detail: { key: row.key } }))
  }).subscribe()
  return () => { void supabase.removeChannel(channel) }
}
