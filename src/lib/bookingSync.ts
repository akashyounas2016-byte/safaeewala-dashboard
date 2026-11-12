import type { Booking, Client, DailyJob, Employee } from '@/types'
import { cleanClientNameFromAddress, getDayNameFromDate, staffNameToCrew } from '@/lib/clientDataSync'
import { addHoursToTime } from '@/lib/utils'
import { addDays } from '@/lib/dubaiTime'

/**
 * Booking ↔ Daily Job Sheet mapping (R-SYNC-03, BJ-01…BJ-18). Pure functions, used by DataContext
 * and the Bookings screen, so both directions follow the same rules.
 */

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const BOOKING_NOTE = '[Booking] '

/** "Villa 12, Arabian Ranches" + "Fatima" → "Villa 12, Arabian Ranches - Fatima" (the client is visible on the
 *  sheet and the monthly-visit check can recognise it — BJ-04) */
export function jobAddressFor(b: Pick<Booking, 'service_address' | 'client_name'>): string {
  const addr = (b.service_address || '').trim()
  const name = (b.client_name || '').trim()
  if (!addr) return name ? `${name} - Dubai` : 'Dubai'
  if (!name || addr.toLowerCase().includes(name.toLowerCase())) return addr
  return `${addr} - ${name}`
}

/** The job-sheet row for a booking (everything except id / created_at) */
export function jobFromBooking(b: Booking, staffName: string, area?: string): Omit<DailyJob, 'id' | 'created_at'> {
  const start = b.scheduled_time || '09:00'
  return {
    date: b.scheduled_date,
    staff_name: staffName || '', // R-SCHED-10: no cleaner = empty, never the word "Unassigned"
    start_time: start,
    end_time: b.end_time || addHoursToTime(start, b.duration_hours || 3),
    duty_hours: num(b.duration_hours || 3),
    ot_hours: 0,
    address: jobAddressFor(b),
    area: area || 'Dubai',
    material: (b.material as DailyJob['material']) || 'No',
    charges: num(b.total_amount),
    received: Math.min(num(b.received_amount), num(b.total_amount)) || (b.status === 'completed' ? num(b.total_amount) : 0),
    payment_mode: b.frequency === 'monthly' ? 'Monthly' : 'Cash',
    is_overtime: false,
    remarks: b.notes ? `${BOOKING_NOTE}${b.notes}` : `Booking: ${b.service_type || 'Standard Clean'}`,
    service: b.service_type || 'Standard Clean',
    booking_id: b.id,
    row_color: b.row_color,
  }
}

/** Fields of a booking edit that the linked job must follow — only fields that were sent (BJ-02, BJ-14) */
export function jobPatchFromBookingPatch(patch: Partial<Booking>, booking: Booking, staffName: string | null): Partial<DailyJob> {
  const out: Partial<DailyJob> = {}
  if (patch.scheduled_date !== undefined) out.date = patch.scheduled_date
  if (patch.scheduled_time !== undefined) out.start_time = patch.scheduled_time
  if (patch.end_time !== undefined) out.end_time = patch.end_time
  if (patch.duration_hours !== undefined) out.duty_hours = num(patch.duration_hours)
  if (patch.assigned_crew !== undefined && staffName) out.staff_name = staffName
  if (patch.service_address !== undefined || patch.client_name !== undefined) {
    out.address = jobAddressFor({ service_address: patch.service_address ?? booking.service_address, client_name: patch.client_name ?? booking.client_name })
  }
  if (patch.total_amount !== undefined) out.charges = num(patch.total_amount)
  if (patch.service_type !== undefined) out.service = patch.service_type
  if (patch.material !== undefined) out.material = patch.material as DailyJob['material']
  if (patch.notes !== undefined) out.remarks = patch.notes ? `${BOOKING_NOTE}${patch.notes}` : ''
  if (patch.status === 'completed') out.received = num(patch.total_amount ?? booking.total_amount)
  // R-DUTY-02: the job row carries the booking's status, so My Duties shows a booking completed in the office as done
  if (patch.status === 'in_progress' || patch.status === 'completed' || patch.status === 'confirmed') out.status = patch.status
  if (patch.received_amount !== undefined) out.received = num(patch.received_amount)
  if (patch.row_color !== undefined) out.row_color = patch.row_color
  return out
}

/** Fields of a job edit that the booking must follow (job → booking direction) */
export function bookingPatchFromJobPatch(
  patch: Partial<DailyJob>,
  before: DailyJob,
  booking: Booking,
  crewIds: string[] | null,
): Partial<Booking> {
  const out: Partial<Booking> = {}
  if (patch.date && patch.date !== booking.scheduled_date) out.scheduled_date = patch.date
  if (patch.start_time && patch.start_time !== booking.scheduled_time) out.scheduled_time = patch.start_time
  if (patch.end_time && patch.end_time !== booking.end_time) out.end_time = patch.end_time
  if (patch.duty_hours !== undefined && num(patch.duty_hours) !== num(booking.duration_hours)) out.duration_hours = num(patch.duty_hours)
  if (patch.charges !== undefined && num(patch.charges) !== num(booking.total_amount)) out.total_amount = num(patch.charges)
  if (patch.service && patch.service !== booking.service_type) out.service_type = patch.service
  if (patch.material && patch.material !== booking.material) out.material = patch.material
  if (patch.remarks !== undefined) {
    const notes = String(patch.remarks || '').replace(/^\[Booking\]\s*/, '')
    if (!/^Booking: /.test(notes) && notes !== (booking.notes || '')) out.notes = notes
  }
  if (crewIds && crewIds.length > 0 && JSON.stringify(crewIds) !== JSON.stringify(booking.assigned_crew)) out.assigned_crew = crewIds
  if (patch.received !== undefined) {
    const charges = num(patch.charges ?? before.charges ?? booking.total_amount)
    const received = num(patch.received)
    out.received_amount = received
    if (received >= charges && charges > 0 && booking.status !== 'completed') out.status = 'completed'
  }
  if (patch.row_color !== undefined && patch.row_color !== booking.row_color) out.row_color = patch.row_color
  return out
}

/** The next visit of a recurring booking: same details, fresh payment state (BJ-06) */
export function nextOccurrence(b: Booking): Omit<Booking, 'id' | 'created_at'> | null {
  if (!b.scheduled_date || b.frequency === 'once') return null
  let date: string
  let anchorDay: number | undefined
  if (b.frequency === 'weekly') date = addDays(b.scheduled_date, 7)
  else if (b.frequency === 'biweekly') date = addDays(b.scheduled_date, 14)
  else {
    const [y, m, d] = b.scheduled_date.split('-').map(Number)
    // E2E-22 / R-BK-03: count from the contract's own day, not from the last visit (a 28th must not stick)
    anchorDay = b.recurrence_day || d
    const last = new Date(y, m + 1, 0).getDate() // days in next month
    date = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-${String(Math.min(anchorDay, last)).padStart(2, '0')}`
  }
  const { id: _id, created_at: _c, received_amount: _r, pending_due: _p, is_partially_paid: _pp, is_sheet_synced: _s, job_sheet_id: _j, ...rest } = b
  void _id; void _c; void _r; void _p; void _pp; void _s; void _j
  return { ...rest, scheduled_date: date, status: 'confirmed', ...(anchorDay ? { recurrence_day: anchorDay } : {}) }
}

/**
 * R-SYNC-12: a new booking is entered in the Add Job form (same fields as the job sheets). The booking is
 * built from that entry, and its job-sheet row keeps the entry exactly (address, area, cleaners, money).
 */
export function bookingFromJobEntry(
  j: Omit<DailyJob, 'id' | 'created_at'>,
  clients: Pick<Client, 'id' | 'full_name' | 'building_name' | 'area' | 'phone' | 'whatsapp'>[],
  employees: Employee[],
): Omit<Booking, 'id' | 'created_at'> & { recurring_days?: string[] } {
  const addr = (j.address || '').trim()
  const key = addr.toLowerCase()
  // same test as the Add Job form uses to call a client registered
  const client = clients.find(c =>
    c.full_name?.toLowerCase().trim() === key ||
    c.building_name?.toLowerCase().trim() === key ||
    `${c.full_name} (${c.building_name || c.area})`.toLowerCase().trim() === key)
  const monthly = j.payment_mode === 'Monthly'
  return {
    client_id: client?.id || '',
    client_name: client?.full_name || cleanClientNameFromAddress(addr) || addr,
    client_phone: client?.whatsapp || client?.phone || '',
    service_address: addr,
    service_type: j.service || 'Standard / General Cleaning',
    status: 'confirmed',
    frequency: monthly ? 'monthly' : 'once',
    scheduled_date: j.date,
    scheduled_time: j.start_time,
    end_time: j.end_time,
    duration_hours: num(j.duty_hours),
    material: j.material || 'No',
    total_amount: num(j.charges),
    received_amount: num(j.received),
    assigned_crew: staffNameToCrew(j.staff_name, employees),
    notes: (j.remarks || '').trim(),
    source: 'manual',
    ...(j.row_color ? { row_color: j.row_color } : {}),
    ...(monthly ? { recurring_days: [getDayNameFromDate(j.date)] } : {}),
  }
}
