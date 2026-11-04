// R-SCHED-06 / R-JOB-01: a cleaner is never booked twice at the same time by the monthly sync,
// a monthly schedule, or a booking; UX-79 rows stay white unless a row / team colour applies
import fs from 'node:fs'
import { busyJobOf, findMonthlyScheduleClashes } from '@/lib/clientDataSync'
import type { Client } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const jobs = [{ date: '2026-11-04', staff_name: 'Ambika', start_time: '09:00', end_time: '12:00', address: 'Office Luxam Trading DMCC' }]
eq(busyJobOf(jobs, 'ambika', '2026-11-04', '09:00 AM', '12:00 PM')?.address, 'Office Luxam Trading DMCC', 'same time, AM/PM or 24h, any letter case')
eq(busyJobOf(jobs, 'Ambika', '2026-11-04', '12:00', '14:00'), undefined, 'back-to-back is fine')
eq(busyJobOf(jobs, 'Ambika', '2026-11-05', '09:00', '12:00'), undefined, 'other date is fine')

const luxam = { id: 'c1', full_name: 'Office Luxam Trading DMCC', service_days: ['Wednesday'], scheduled_time: '09:00', end_time: '12:00', preferred_cleaner: 'Ambika', day_cleaner_assignments: { Wednesday: 'Ambika' } } as unknown as Client
const clashes = findMonthlyScheduleClashes({ id: 'c2', full_name: 'Office ABC Trading DMCC' }, { Wednesday: { startTime: '09:00', endTime: '12:00', cleaner: 'Ambika' } }, [luxam])
eq(clashes.map(c => [c.day, c.cleaner, c.other]), [['Wednesday', 'Ambika', 'Office Luxam Trading DMCC']], 'a monthly schedule clash is found before saving')
eq(findMonthlyScheduleClashes({ id: 'c1', full_name: 'Office Luxam Trading DMCC' }, { Wednesday: { startTime: '09:00', endTime: '12:00', cleaner: 'Ambika' } }, [luxam]), [], 'the client itself is not a clash')

const lib = fs.readFileSync('src/lib/clientDataSync.ts', 'utf8')
eq(/const staff = busy \? '' : shift\.cleanerName/.test(lib), true, 'monthly sync adds a clashing visit unassigned')
const booking = fs.readFileSync('src/components/bookings/NewBookingModal.tsx', 'utf8')
eq(/findStaffClash\(\[\.\.\.sheetJobs, \.\.\.bookedShifts\]/.test(booking), true, 'booking entry checks the job sheet and other bookings')
const monthly = fs.readFileSync('src/components/monthlyClients/AddMonthlyClientModalForm.tsx', 'utf8')
eq(/findMonthlyScheduleClashes\(/.test(monthly), true, 'monthly schedule save checks other monthly clients')
const sheet = fs.readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/else if \(hasCustomBlockColor\) \{\s+const chosenPalette/.test(sheet), false, 'a cleaner block colour no longer paints the rows')
const djs = fs.readFileSync('src/pages/DailyJobSheet.tsx', 'utf8')
eq(/dynamicRowBg = teamBg/.test(djs), true, 'Daily Job Sheet: one colour per team project')
