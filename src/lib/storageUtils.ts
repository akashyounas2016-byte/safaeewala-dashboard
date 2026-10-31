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

export function safeLocalStorageSet(key: string, value: any): boolean {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, serialized)
    onLocalWrite(key) // business keys are mirrored to Supabase app_state (AUD-02)
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
        ]
        nonCriticalKeys.forEach(k => localStorage.removeItem(k))

        const serialized = typeof value === 'string' ? value : JSON.stringify(value)
        localStorage.setItem(key, serialized)
        return true
      } catch (again) {
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
  ]
  nonCriticalKeys.forEach(k => {
    try { localStorage.removeItem(k) } catch {}
  })
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (k.includes('_cache') || k.includes('_backup') || k.includes('_log') || k.includes('_debug'))) {
        localStorage.removeItem(k)
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
