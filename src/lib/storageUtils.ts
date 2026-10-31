/**
 * Safe LocalStorage Manager with automatic QuotaExceededError protection and fallback.
 * Prevents the application from crashing when large Excel sheets or years of job logs exceed 5MB.
 */

import { onLocalWrite } from '@/lib/cloudState'
import { reportError } from '@/lib/errorReport'

/** TA-21: a failed browser save is shown to the user, not only logged */
export const STORAGE_PROBLEM_EVENT = 'safaeewala:storage-problem'
let storageProblem: string | null = null
export const getStorageProblem = () => storageProblem
function flagStorageProblem(key: string, err: unknown) {
  storageProblem = `This browser's storage is full — the latest change to "${key.replace('safaeewala_', '')}" could not be kept on this device.`
  window.dispatchEvent(new Event(STORAGE_PROBLEM_EVENT))
  reportError(err instanceof Error ? err : new Error(String(err)), `localStorage ${key}`)
}

/**
 * Browser copies of cloud tables. Since every record is saved in Supabase (R-SYNC-07) these are only a
 * cache for a fast start: when the browser is full they are stored without heavy file/photo data,
 * or skipped — never a reason to warn the user.
 */
const TABLE_CACHE_KEYS = new Set([
  'safaeewala_bookings', 'safaeewala_clients', 'safaeewala_employees', 'safaeewala_agencies',
  'safaeewala_invoices', 'safaeewala_inventory', 'safaeewala_daily_jobs', 'safaeewala_daily_expenses',
  'safaeewala_fluent_form_leads',
])
const isTableCache = (k: string) =>
  TABLE_CACHE_KEYS.has(k) ||
  TABLE_CACHE_KEYS.has(`safaeewala_${k}`) ||
  TABLE_CACHE_KEYS.has(k.replace('safaeewala_', ''))

/** Same rows without embedded files / photos (data: URLs) — they stay in the cloud */
function withoutEmbeddedFiles(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'string' && v.startsWith('data:') && v.length > 2000 ? undefined : v)))
}

export function safeLocalStorageSet(key: string, value: any): boolean {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, serialized)
    try { onLocalWrite(key) } catch { /* ignore non-blocking cloud mirror errors */ }
    return true
  } catch (err: any) {
    console.warn(`[Storage] Failed to save key "${key}" to localStorage:`, err?.message || err)

    // Handle QuotaExceededError
    if (
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014
    ) {
      console.warn('[Storage] Quota exceeded. Attempting graceful memory prune of non-critical cache...')
      try {
        // Prune non-critical caches to free space
        const nonCriticalKeys = [
          'safaeewala_fluent_form_leads_backup',
          'safaeewala_cached_reports',
          'safaeewala_temp_excel_cache',
          'safaeewala_audit_log',
          'safaeewala_app_error_reports',
          'safaeewala_bookings_read_notifs',
          'safaeewala_bookings_deleted_notifs',
          'safaeewala_snapshots',
          'safaeewala_deletion_snapshots', // before-delete copies (Settings → Backup) — up to 600 KB
        ]
        nonCriticalKeys.forEach(k => localStorage.removeItem(k))

        const serialized = typeof value === 'string' ? value : JSON.stringify(value)
        localStorage.setItem(key, serialized)
        return true
      } catch (again) {
        if (isTableCache(key)) {
          // A cloud table's browser copy: keep a light version, or none — the data is in the cloud
          try {
            localStorage.setItem(key, JSON.stringify(withoutEmbeddedFiles(value)))
          } catch {
            localStorage.removeItem(key) // a stale copy is worse than none
            console.info(`[Storage] "${key}" is not cached in this browser (storage full) — it loads from the cloud`)
          }
          return true
        }
        // Still full: keep the app running but tell the user (TA-21)
        flagStorageProblem(key, again)
        return false
      }
    }
    flagStorageProblem(key, err)
    return false
  }
}

export function pruneNonCriticalStorage(): void {
  const nonCriticalKeys = [
    'safaeewala_fluent_form_leads_backup',
    'safaeewala_cached_reports',
    'safaeewala_temp_excel_cache',
    'safaeewala_audit_log',
    'safaeewala_app_error_reports',
    'safaeewala_bookings_read_notifs',
    'safaeewala_bookings_deleted_notifs',
    'safaeewala_snapshots',
    'safaeewala_deletion_snapshots',
  ]
  nonCriticalKeys.forEach(k => {
    try { localStorage.removeItem(k) } catch {}
  })
  // Cloud tables' browser copies keep their rows but drop embedded files / photos (still in the cloud)
  TABLE_CACHE_KEYS.forEach(k => {
    try {
      const raw = localStorage.getItem(k)
      if (raw && raw.length > 200_000) localStorage.setItem(k, JSON.stringify(withoutEmbeddedFiles(JSON.parse(raw))))
    } catch { /* leave it */ }
  })
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (k.includes('_cache') || k.includes('_backup') || k.includes('_log') || k.includes('_debug'))) {
        localStorage.removeItem(k)
      }
    }
    const rawOutbox = localStorage.getItem('safaeewala_sync_outbox')
    if (rawOutbox) {
      const parsed = JSON.parse(rawOutbox)
      if (Array.isArray(parsed) && parsed.length > 10) {
        localStorage.setItem('safaeewala_sync_outbox', JSON.stringify(parsed.slice(-10)))
      }
    }
  } catch {}
  storageProblem = null
  window.dispatchEvent(new Event(STORAGE_PROBLEM_EVENT))
}

export function clearStorageProblem(): void {
  storageProblem = null
  window.dispatchEvent(new Event(STORAGE_PROBLEM_EVENT))
}

export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
