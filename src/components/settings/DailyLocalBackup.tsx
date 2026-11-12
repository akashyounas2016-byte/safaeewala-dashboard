import { useEffect, useRef } from 'react'
import { useData } from '@/store/DataContext'
import { useIsAdmin } from '@/store/UserContext'
import { localBackupSupported, sendDriveBackup, writeLocalBackup, type BackupData } from '@/lib/localBackup'

/**
 * R-OPS-08: once a day, the first time an admin has the CRM open with the data loaded, today's copy is saved
 * to the chosen folder on this computer and sent to the Google Drive webhook (when one is set). Silent:
 * the result shows in Settings → Backup. Renders nothing.
 */
export function DailyLocalBackup() {
  const isAdmin = useIsAdmin()
  const { loading, bookings, clients, employees, invoices, inventory, dailyJobs, dailyExpenses } = useData()
  const latest = useRef<BackupData | null>(null)
  const started = useRef(false)
  useEffect(() => {
    latest.current = { bookings, clients, employees, invoices, inventory, dailyJobs, dailyExpenses }
  }, [bookings, clients, employees, invoices, inventory, dailyJobs, dailyExpenses])

  const ready = isAdmin && !loading && dailyJobs.length > 0
  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    // after the screen has settled — a backup must never slow down the first view; the newest data is used
    setTimeout(() => {
      const data = latest.current
      if (!data) return
      if (localBackupSupported()) void writeLocalBackup(data)
      void sendDriveBackup(data)
    }, 15_000)
  }, [ready])
  return null
}
