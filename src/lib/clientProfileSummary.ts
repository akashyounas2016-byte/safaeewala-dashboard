import type { Booking, DailyJob } from '@/types'
import { splitStaffNames } from '@/lib/clientDataSync'

/**
 * UX-98 audit of the Client Profile side widgets.
 * Upcoming: open bookings dated today or later (no longer past "confirmed" ones), plus the client's visits
 * already on the Daily Job Sheet for today or later that no booking covers (monthly / Bi-Weekly syncs).
 */
export interface UpcomingVisit {
  key: string
  date: string
  time: string
  label: string
  cleaners: string
  status: Booking['status'] | 'on_sheet'
}

const day = (d?: string) => String(d || '').split('T')[0]

export function upcomingVisits(bookings: Booking[], jobs: DailyJob[], today: string): UpcomingVisit[] {
  const open = bookings.filter(b => ['pending', 'confirmed', 'in_progress'].includes(b.status) && day(b.scheduled_date) >= today)
  const covered = new Set(open.map(b => b.id))
  const fromBookings: UpcomingVisit[] = open.map(b => ({
    key: `b-${b.id}`, date: day(b.scheduled_date), time: b.scheduled_time || '', label: b.service_type || 'Booking', cleaners: '', status: b.status,
  }))
  const fromSheet: UpcomingVisit[] = jobs
    .filter(j => day(j.date) >= today && !(j.booking_id && covered.has(j.booking_id)))
    .map(j => ({
      key: `j-${j.id}`, date: day(j.date), time: j.start_time || '', label: j.service || (j.payment_mode === 'Monthly' ? 'Monthly visit' : 'Scheduled visit'),
      cleaners: splitStaffNames(j.staff_name || '').join(', '), status: 'on_sheet' as const,
    }))
  return [...fromBookings, ...fromSheet].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}

/** Job Sheet Summary: shifts worked up to today vs. scheduled ahead, each cleaner once, the last worked date */
export function jobSheetSummary(jobs: DailyJob[], today: string): { worked: number; ahead: number; cleaners: string[]; lastWorked: string } {
  const worked = jobs.filter(j => day(j.date) <= today)
  const cleaners = new Map<string, string>()
  jobs.forEach(j => splitStaffNames(j.staff_name || '').forEach(n => { if (!cleaners.has(n.toLowerCase())) cleaners.set(n.toLowerCase(), n) }))
  return {
    worked: worked.length,
    ahead: jobs.length - worked.length,
    cleaners: Array.from(cleaners.values()).sort((a, b) => a.localeCompare(b)),
    lastWorked: worked.map(j => day(j.date)).sort().pop() || '',
  }
}
