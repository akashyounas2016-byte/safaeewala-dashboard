// R-BK-04 booking status menu + live steps, UX-125 live Busy tag, UX-126 AI Bot place and counter
import { readFileSync } from 'node:fs'
import { busyCleaners } from '@/lib/staffBusy'
import { jobProgress, type JobCheckin } from '@/lib/jobCheckins'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const jobs = [
  { id: 'j1', date: '2026-11-09', staff_name: 'Uma Sunar', start_time: '09:00 AM', end_time: '12:00 PM', address: 'Office ABC' },
  { id: 'j2', date: '2026-11-09', staff_name: 'Misbah, Ambika', start_time: '02:00 PM', end_time: '06:00 PM', address: 'Marina' },
  { id: 'j3', date: '2026-11-10', staff_name: 'Uma Sunar', start_time: '09:00 AM', end_time: '11:00 AM', address: 'JVC' },
]
const at = (nowMin: number, date = '2026-11-09', window?: { start?: string; end?: string }) => [...busyCleaners(jobs, date, { today: '2026-11-09', nowMin, window }).keys()].sort()
eq(at(10 * 60), ['ambika', 'misbah', 'uma sunar'], '10:00 — Uma working, Misbah / Ambika later today')
eq(at(13 * 60), ['ambika', 'misbah'], '13:00 — Uma\'s job is over: no longer Busy')
eq(at(19 * 60), [], '19:00 — every job over: nobody Busy')
eq(at(19 * 60, '2026-11-10'), ['uma sunar'], 'tomorrow: jobs that day')
eq(at(8 * 60, '2026-11-09', { start: '12:30 PM', end: '01:30 PM' }), [], 'a time between the jobs: nobody Busy')
eq(at(8 * 60, '2026-11-09', { start: '11:00 AM', end: '03:00 PM' }), ['ambika', 'misbah', 'uma sunar'], 'an overlapping time: all three Busy')
eq(at(8 * 60, '2026-11-08'), [], 'a past day: nobody Busy')
eq(busyCleaners(jobs, '2026-11-09', { today: '2026-11-09', nowMin: 600, ignoreIds: ['j1'] }).has('uma sunar'), false, 'the job being edited does not make its own cleaner Busy')

const ck = (job_id: string, status: JobCheckin['status']) => ({ id: `${job_id}|x${status}`, job_id, date: '2026-11-09', cleaner: 'x', status, updated_at: '' }) as JobCheckin
eq([jobProgress({ a: ck('j2', 'on_way'), b: ck('j2', 'started') }, ['j2']), jobProgress({ a: ck('j1', 'done') }, ['j2']), jobProgress({}, ['j1'])], ['started', null, null], 'the furthest step of the job\'s cleaners')

const bk = readFileSync('src/pages/Bookings.tsx', 'utf8')
eq(/function StatusMenu/.test(bk) && /label: 'Unconfirmed'/.test(bk) && /<StatusMenu status=\{b\.status\} live=\{liveOf\(b\)\}/.test(bk), true, 'card status is a menu with the live step')
eq(/if \(patch\.status\) jobPatch\.status = patch\.status/.test(bk) && /status = j\.status as BookingStatus/.test(bk), true, 'a card from a job-sheet row follows the Edit popup at once')
eq(['src/components/dailyJobSheet/AddJobModal.tsx', 'src/components/bookings/NewBookingModal.tsx'].every(f => /busyCleaners\(/.test(readFileSync(f, 'utf8'))), true, 'both staff pickers use the live Busy rule')

const side = readFileSync('src/components/layout/Sidebar.tsx', 'utf8')
eq(/item\.to === '\/settings' && !isFieldLogin && <AIBotNavItem/.test(side) && !/item\.to === '\/alerts' && !isFieldLogin && <AIBotNavItem/.test(side), true, 'AI Bot between Reports and Settings')
eq(/bg-rose-500 text-white shadow-\[0_2px_10px_rgba\(244,63,94,0\.45\)\] animate-pulse/.test(side), true, 'AI Bot counter red and blinking like Alerts')
