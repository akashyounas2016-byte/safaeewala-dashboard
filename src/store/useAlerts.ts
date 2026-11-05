import { useCallback, useEffect, useMemo, useState } from 'react'
import { useData } from '@/store/DataContext'
import { useNotifications } from '@/store/NotificationContext'
import { analyzeCRMHealth } from '@/lib/crmAIBot'
import { buildCrewTimeline } from '@/lib/crewTimeline'
import { backupHealth, type BackupStatus } from '@/lib/backupStatus'
import { agencyAlerts, bookingAlerts, buildAlerts, employeeDocAlerts, type CrmAlert } from '@/lib/alerts'
import { todayDubai } from '@/lib/dubaiTime'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

const DISMISSED_KEY = 'safaeewala_alerts_dismissed'
const CHANGED = 'safaeewala:alerts-dismissed'

/** R-ALERT-01: every CRM alert, minus those dismissed in this browser. `enabled` false for field staff (R-SEC-05). */
export function useAlerts(enabled = true): {
  alerts: CrmAlert[]
  dismissed: CrmAlert[]
  dismiss: (id: string) => void
  restoreAll: () => void
} {
  const { bookings, clients, dailyJobs, employees, agencies } = useData()
  const { notifications } = useNotifications()
  const today = todayDubai()

  const [backup, setBackup] = useState<BackupStatus | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetch('/api/backup-status')
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (alive) setBackup(s as BackupStatus | null) })
      .catch(() => { /* offline or local dev without the server: no backup alert */ })
    return () => { alive = false }
  }, [enabled])

  const [dismissedIds, setDismissedIds] = useState<string[]>(() => safeLocalStorageGet<string[]>(DISMISSED_KEY, []))
  useEffect(() => {
    const refresh = () => setDismissedIds(safeLocalStorageGet<string[]>(DISMISSED_KEY, []))
    window.addEventListener(CHANGED, refresh)
    return () => window.removeEventListener(CHANGED, refresh)
  }, [])
  const save = useCallback((ids: string[]) => {
    safeLocalStorageSet(DISMISSED_KEY, ids.slice(-500))
    window.dispatchEvent(new Event(CHANGED))
  }, [])

  const all = useMemo(() => {
    if (!enabled) return []
    const sheet = buildCrewTimeline(dailyJobs.filter(j => (j.date || '').split('T')[0] === today), [], () => undefined)
    return buildAlerts({
      notifications,
      aiIssues: analyzeCRMHealth(bookings, clients).issues,
      sheetIssues: sheet.issues,
      today,
      backup: backup ? { health: backupHealth(backup, new Date()), message: backup.message } : null,
      extra: [...employeeDocAlerts(employees), ...agencyAlerts(agencies, employees), ...bookingAlerts(bookings, today)],
    })
  }, [enabled, notifications, bookings, clients, dailyJobs, employees, agencies, today, backup])

  const hidden = new Set(dismissedIds)
  return {
    alerts: all.filter(a => !hidden.has(a.id)),
    dismissed: all.filter(a => hidden.has(a.id)),
    dismiss: id => save([...dismissedIds.filter(x => x !== id), id]),
    restoreAll: () => save([]),
  }
}
