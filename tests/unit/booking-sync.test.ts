// Booking ↔ Daily Job Sheet mapping and the monthly-visit guard (BJ-01…BJ-18)
import { jobFromBooking, jobPatchFromBookingPatch, bookingPatchFromJobPatch, nextOccurrence, jobAddressFor } from '@/lib/bookingSync'
import { syncMonthlySchedulesToDailyJobs, markInitialDataLoaded, getDayNameFromDate } from '@/lib/clientDataSync'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }

const booking: any = { id: 'b1', client_id: 'c1', client_name: 'TEST Fatima', client_phone: '', service_address: 'Villa 12, JLT', service_type: 'Deep Clean',
  status: 'confirmed', frequency: 'weekly', scheduled_date: '2026-11-03', scheduled_time: '09:00', end_time: '13:00', duration_hours: 4,
  assigned_crew: ['e1'], total_amount: 300, material: 'Yes', notes: 'Bring ladder', created_at: '', received_amount: 100, is_partially_paid: true, job_sheet_id: 'j0', is_sheet_synced: true }

eq(jobAddressFor(booking), 'Villa 12, JLT - TEST Fatima', 'job address names the client (monthly check can see it)')
eq(jobAddressFor({ service_address: 'TEST Fatima villa', client_name: 'TEST Fatima' }), 'TEST Fatima villa', 'name not added twice')
const job = jobFromBooking(booking, 'TEST Rupa', 'JLT')
eq([job.staff_name, job.area, job.material, job.charges, job.received, job.booking_id], ['TEST Rupa', 'JLT', 'Yes', 300, 100, 'b1'], 'job row from booking (area, material, part payment)')
eq(job.remarks, '[Booking] Bring ladder', 'notes carried as remarks')

eq(jobPatchFromBookingPatch({ scheduled_time: '10:00' }, booking, null), { start_time: '10:00' }, 'BJ-01/02: only changed fields — no received / staff reset')
eq(jobPatchFromBookingPatch({ status: 'completed' }, booking, null), { received: 300 }, 'completed = full charge collected')
eq(jobPatchFromBookingPatch({ material: 'No', notes: '' }, booking, null), { material: 'No', remarks: '' }, 'BJ-14: material and notes follow')
eq(jobPatchFromBookingPatch({ assigned_crew: ['e9'] }, booking, null), {}, 'unknown crew does not blank the cleaner')

const before: any = { ...job, id: 'j1', created_at: '' }
eq(bookingPatchFromJobPatch({ received: 300 }, before, booking, null), { received_amount: 300, status: 'completed' }, 'full payment on the sheet completes the booking')
eq(bookingPatchFromJobPatch({ received: 150 }, before, booking, null), { received_amount: 150 }, 'part payment reaches the booking')
eq(bookingPatchFromJobPatch({ remarks: '[Booking] Use side door' }, before, booking, null), { notes: 'Use side door' }, 'sheet remarks update booking notes')
eq(bookingPatchFromJobPatch({ material: 'No' }, before, booking, null), { material: 'No' }, 'sheet material updates the booking')

const nxt: any = nextOccurrence(booking)
eq([nxt.scheduled_date, nxt.status, nxt.received_amount, nxt.is_partially_paid, nxt.job_sheet_id, nxt.id], ['2026-11-10', 'confirmed', undefined, undefined, undefined, undefined], 'BJ-06: next weekly visit with fresh payment state')
eq((nextOccurrence({ ...booking, frequency: 'monthly', scheduled_date: '2026-01-31' }) as any).scheduled_date, '2026-02-28', 'monthly visit on the 31st → last day of next month')
eq(nextOccurrence({ ...booking, frequency: 'once' }), null, 'one-off booking has no next visit')

// BJ-04: monthly visits are not added before the data has loaded, and only once per session
const date = '2026-11-04'
const client: any = { id: 'c7', full_name: 'TEST Monthly Client', phone: '', area: 'JLT', city: 'Dubai', source: 'monthly', service_days: [getDayNameFromDate(date)],
  scheduled_time: '09:00', end_time: '13:00', duration_hours: 4, preferred_cleaner: 'TEST Rupa', total_bookings: 0, total_spent: 0, created_at: '' }
const added: any[] = []
const add = (j: any) => added.push(j)
eq(syncMonthlySchedulesToDailyJobs(date, [client], [], add).insertedCount, 0, 'nothing added before the cloud data has loaded')
markInitialDataLoaded()
eq(syncMonthlySchedulesToDailyJobs(date, [client], [], add).insertedCount, 1, 'added once after loading')
eq(syncMonthlySchedulesToDailyJobs(date, [client], [], add).insertedCount, 0, 'a second screen with a stale list does not add it again')
eq(added.length, 1, 'exactly one row')
