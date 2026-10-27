/**
 * Safe LocalStorage Manager with automatic QuotaExceededError protection and fallback.
 * Prevents the application from crashing when large Excel sheets or years of job logs exceed 5MB.
 */

import { onLocalWrite } from '@/lib/cloudState'

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
        ]
        nonCriticalKeys.forEach(k => localStorage.removeItem(k))

        const serialized = typeof value === 'string' ? value : JSON.stringify(value)
        localStorage.setItem(key, serialized)
        return true
      } catch {
        // Fallback: If still full, do not crash the app
        return false
      }
    }
    return false
  }
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
