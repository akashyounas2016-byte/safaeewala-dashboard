// R-JOB-01 — a cleaner cannot be booked twice at the same time
import { findStaffClash, findClashAmong, timingChanged, timeToMinutes } from '@/lib/shiftClash'

const eq = (a: unknown, b: unknown, m: string) => {
  if (a !== b) {
    console.log('FAIL', m, a, b)
    process.exitCode = 1
  } else {
    console.log('PASS ', m)
  }
}

const day = '2026-10-31'
const jobs = [
  { id: 'a', date: day, staff_name: 'Ambika', start_time: '09:00 AM', end_time: '12:00 PM', address: 'Office Luxam' },
  { id: 'b', date: day, staff_name: 'Ali, Rahim', start_time: '14:00', end_time: '17:00' },
  { id: 'c', date: '2026-11-01', staff_name: 'Parmila', start_time: '09:00 AM', end_time: '12:00 PM' },
]

eq(timeToMinutes('09:00 AM'), 540, '12h time read')
eq(timeToMinutes('21:30'), 1290, '24h time read')
eq(timeToMinutes(''), null, 'blank is not a time')

eq(findStaffClash(jobs, { staff_name: 'Ambika', date: day, start_time: '09:00 AM', end_time: '12:00 PM' })?.job.id, 'a', 'same slot clashes (screenshot case)')
eq(findStaffClash(jobs, { staff_name: 'ambika', date: day, start_time: '11:00 AM', end_time: '01:00 PM' })?.staff, 'Ambika', 'partial overlap clashes, any letter case')
eq(findStaffClash(jobs, { staff_name: 'Ambika', date: day, start_time: '12:00 PM', end_time: '03:00 PM' }), null, 'back-to-back shifts allowed')
eq(findStaffClash(jobs, { staff_name: 'Parmila', date: day, start_time: '09:00 AM', end_time: '12:00 PM' }), null, 'other date does not clash')
eq(findStaffClash(jobs, { staff_name: 'Rahim', date: day, start_time: '03:00 PM', end_time: '04:00 PM' })?.job.id, 'b', 'member of a team job clashes')
eq(findStaffClash(jobs, { staff_name: 'Rahima', date: day, start_time: '03:00 PM', end_time: '04:00 PM' }), null, 'whole names only (R-SYNC-04)')
eq(findStaffClash(jobs, { staff_name: 'Ambika', date: day, start_time: '', end_time: '' }), null, 'no times — no clash')
eq(findStaffClash(jobs, { id: 'a', staff_name: 'Ambika', date: day, start_time: '10:00 AM', end_time: '01:00 PM' }), null, 'a job does not clash with itself')
eq(findStaffClash(jobs, { staff_name: 'Ambika', date: day, start_time: '10:00 AM', end_time: '11:00 AM' }, ['a']), null, 'edited job is ignored')
eq(findStaffClash([{ id: 'n', date: day, staff_name: 'Laxmi', start_time: '10:00 PM', end_time: '01:00 AM' }], { staff_name: 'Laxmi', date: day, start_time: '11:00 PM', end_time: '11:30 PM' })?.job.id, 'n', 'shift past midnight clashes')

// Excel grid: per-cleaner rows of one job never clash with each other
const grid = [
  { id: 'j1', _originalJobId: 'j1', date: day, staff_name: 'Ali', start_time: '09:00 AM', end_time: '11:00 AM' },
  { id: 'j1-cleaner-rahim', _originalJobId: 'j1', date: day, staff_name: 'Rahim', start_time: '09:00 AM', end_time: '11:00 AM' },
  { id: 'r2', date: day, staff_name: 'Rahim', start_time: '10:00 AM', end_time: '12:00 PM' },
]
eq(findClashAmong(grid, [grid[0]]), null, 'rows of one team job do not clash')
eq(findClashAmong(grid, [grid[2]])?.job.id, 'j1-cleaner-rahim', 'new row double-booking a team member clashes')

eq(timingChanged({ staff_name: 'A', start_time: '09:00 AM' }, { staff_name: 'A', start_time: '09:00 AM' }), false, 'remarks-only edit is not a timing change')
eq(timingChanged({ staff_name: 'A', start_time: '09:00 AM' }, { staff_name: 'B', start_time: '09:00 AM' }), true, 'cleaner change is a timing change')
eq(timingChanged(undefined, { staff_name: 'A' }), true, 'new row counts as changed')
