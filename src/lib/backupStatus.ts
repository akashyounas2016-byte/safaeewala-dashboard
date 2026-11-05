/** Result of the nightly database backup, as /api/backup-status returns it (UX-93, R-OPS-04) */
export interface BackupStatus {
  configured: boolean
  ok?: boolean
  at?: string
  message?: string
  tables?: number
  daily_count?: number
  monthly_count?: number
  total_size?: string
  keep_days?: number
  offsite?: boolean
}

export type BackupHealth = 'none' | 'ok' | 'failed' | 'stale'

/** A run is due every night; more than 26 hours without one means the backup stopped */
const STALE_MS = 26 * 60 * 60 * 1000

export function backupHealth(s: BackupStatus, now: Date): BackupHealth {
  if (!s.configured || !s.at) return 'none'
  if (!s.ok) return 'failed'
  const at = new Date(s.at).getTime()
  if (Number.isNaN(at) || now.getTime() - at > STALE_MS) return 'stale'
  return 'ok'
}

/** Next run: 02:00 Dubai (UTC+4, no daylight saving) = 22:00 UTC */
export function nextBackupAt(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0))
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next
}
