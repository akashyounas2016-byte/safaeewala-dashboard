import type { AppNotification } from '@/store/NotificationContext'
import type { DetectedIssue } from '@/lib/crmAIBot'
import type { TimelineIssue } from '@/lib/crewTimeline'
import type { BackupHealth } from '@/lib/backupStatus'
import type { Agency, Booking, Client, Employee } from '@/types'
import { employeeMatchesStaff, splitStaffNames } from '@/lib/clientDataSync'
import { buildAgencyNotifications } from '@/lib/agencyAlerts'
import { daysUntil, formatDate } from '@/lib/utils'

/**
 * R-ALERT-01: every alert of the CRM in one list, for Sidebar → Alerts. Main screens no longer carry
 * alert tickers or banners. Sources: system notifications (late jobs, overdue invoices, low stock),
 * AI Bot findings (duplicates, discrepancies), today's Daily Job Sheet issues (clash, no cleaner) and
 * the nightly backup, plus what the Employees / Agencies / Bookings header bells showed.
 */
export type AlertSeverity = 'high' | 'medium' | 'low'
export type AlertSource = 'system' | 'ai' | 'sheet' | 'backup' | 'staff' | 'bookings'

export interface CrmAlert {
  id: string
  source: AlertSource
  severity: AlertSeverity
  title: string
  message: string
  actionUrl?: string
  actionLabel?: string
  /** AI Bot findings open the AI Bot (move to Pending etc.) */
  opensAIBot?: boolean
}

export const SOURCE_LABEL: Record<AlertSource, string> = {
  system: 'System', ai: 'AI Bot', sheet: 'Daily Job Sheet', backup: 'Backup', staff: 'Staff & agencies', bookings: 'Bookings',
}

const RANK: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 }

export function buildAlerts(input: {
  notifications: AppNotification[]
  aiIssues: DetectedIssue[]
  sheetIssues: TimelineIssue[]
  today: string
  backup?: { health: BackupHealth; message?: string } | null
  extra?: CrmAlert[]
}): CrmAlert[] {
  const out: CrmAlert[] = [...(input.extra || [])]
  input.notifications.forEach(n => out.push({
    id: `sys-${n.id}`, source: 'system',
    severity: n.type === 'error' ? 'high' : n.type === 'warning' ? 'medium' : 'low',
    title: n.title, message: n.message, actionUrl: n.actionUrl, actionLabel: 'Open',
  }))
  input.aiIssues.forEach(i => out.push({
    id: `ai-${i.id}`, source: 'ai', severity: i.severity,
    title: i.title, message: [i.description, i.recommendation].filter(Boolean).join(' '),
    opensAIBot: true, actionLabel: 'Review in AI Bot',
  }))
  input.sheetIssues.forEach(i => out.push({
    id: `sheet-${input.today}-${i.kind}-${i.job.id}-${i.staff.toLowerCase()}`, source: 'sheet',
    severity: i.kind === 'clash' ? 'high' : 'medium',
    title: i.kind === 'clash' ? `Clash · ${i.staff}` : 'Job without a cleaner',
    message: i.text, actionUrl: `/daily-job-sheet?date=${input.today}`, actionLabel: 'Open sheet',
  }))
  const b = input.backup
  if (b && (b.health === 'failed' || b.health === 'stale')) {
    out.push({
      id: `backup-${b.health}`, source: 'backup', severity: 'high',
      title: b.health === 'failed' ? 'Last night\'s backup failed' : 'No backup for more than a day',
      message: `${b.message ? `${b.message}. ` : ''}The data is safe in Supabase, but there is no new copy.`,
      actionUrl: '/settings?tab=backup', actionLabel: 'Backup status',
    })
  }
  return out.sort((x, y) => RANK[x.severity] - RANK[y.severity])
}

// ── Alerts that were in the page header bells (Employees, Agencies, Bookings) — R-ALERT-01 ──

const HERO_SEVERITY: Record<string, AlertSeverity> = { danger: 'high', warning: 'medium', info: 'low', success: 'low' }

/** Employee documents expired or expiring within 30 days (was the Employees header bell) */
export function employeeDocAlerts(employees: Employee[]): CrmAlert[] {
  const docs: [keyof Employee, string][] = [
    ['visa_expiry', 'Visa'], ['passport_expiry', 'Passport'], ['work_permit_expiry', 'Work Permit'],
    ['eid_end_date', 'Emirates ID'], ['medical_insurance_expiry', 'Medical Insurance'],
    ['driving_license_expiry_date', 'Driving License'], ['end_date', 'Employment contract'],
  ]
  const out: CrmAlert[] = []
  employees.forEach(e => {
    if (e.status === 'inactive') return
    docs.forEach(([field, label]) => {
      const date = e[field] as string | undefined
      if (!date) return
      const days = daysUntil(date)
      if (days > 30) return
      out.push({
        id: `emp-${e.id}-${String(field)}`, source: 'staff', severity: days < 0 ? 'high' : 'medium',
        title: `${e.full_name}: ${label} ${days < 0 ? 'expired' : 'expiring'}`,
        message: days < 0 ? `Expired ${-days} day${-days === 1 ? '' : 's'} ago (${formatDate(date)})`
          : `${days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`} (${formatDate(date)})`,
        actionUrl: `/employees/${e.id}`, actionLabel: 'Open employee',
      })
    })
  })
  return out
}

/** Agency documents, payouts and agency staff compliance (was the Agencies header bell) */
export function agencyAlerts(agencies: Agency[], employees: Employee[]): CrmAlert[] {
  return agencies.flatMap(a => buildAgencyNotifications([a], employees, () => {}).map(n => ({
    id: `agency-${n.id}`, source: 'staff' as const, severity: HERO_SEVERITY[n.tone || 'info'],
    title: n.title, message: n.detail || '', actionUrl: `/agencies/${a.id}`, actionLabel: 'Open agency',
  })))
}

/**
 * R-ALERT-02: a monthly / Bi-Weekly schedule that names a cleaner who is not an employee (deleted or
 * misspelt). The monthly sync keeps adding visits for that name, so the schedule needs a new cleaner.
 */
export function scheduleCleanerAlerts(clients: Client[], employees: Employee[]): CrmAlert[] {
  const out: CrmAlert[] = []
  clients.forEach(c => {
    if (c.contract_active === false || !(c.service_days || []).length) return
    const names = new Set<string>()
    ;[c.preferred_cleaner, ...Object.values(c.day_cleaner_assignments || {})].forEach(v => splitStaffNames(String(v || '')).forEach(n => names.add(n)))
    const missing = [...names].filter(n => !employees.some(e => employeeMatchesStaff(e, n)))
    if (missing.length === 0) return
    out.push({
      id: `sched-cleaner-${c.id}-${missing.join('|').toLowerCase()}`, source: 'staff', severity: 'high',
      title: `Schedule uses a cleaner who is not an employee: ${c.full_name}`,
      message: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on the Employees list (deleted or spelt differently). Visits keep being added under ${missing.length === 1 ? 'this name' : 'these names'} — pick a cleaner in the schedule.`,
      actionUrl: '/monthly-clients', actionLabel: 'Open Monthly Clients',
    })
  })
  return out
}

/** Pending bookings and today's bookings without a cleaner (was the Bookings header bell) */
export function bookingAlerts(bookings: Booking[], today: string): CrmAlert[] {
  const out: CrmAlert[] = []
  bookings.forEach(b => {
    if (b.status === 'pending') out.push({
      id: `bk-pending-${b.id}`, source: 'bookings', severity: 'medium',
      title: `Pending booking: ${b.client_name}`, message: `${b.service_type} on ${formatDate(b.scheduled_date)} awaiting confirmation`,
      actionUrl: `/bookings?booking=${encodeURIComponent(b.id)}`, actionLabel: 'Open booking',
    })
    if (b.scheduled_date === today && b.status !== 'completed' && b.status !== 'cancelled' && !(b.assigned_crew || []).length) out.push({
      id: `bk-unassigned-${b.id}`, source: 'bookings', severity: 'high',
      title: `No cleaner: ${b.client_name}`, message: `Today at ${b.scheduled_time} needs a cleaner`,
      actionUrl: `/bookings?booking=${encodeURIComponent(b.id)}`, actionLabel: 'Open booking',
    })
  })
  return out
}
