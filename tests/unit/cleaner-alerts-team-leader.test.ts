// R-ALERT-04 (cleaner issues in alerts), R-EMP-10 (skills & assessment 3 columns), R-JOB-09 (team leader dropdown & time preservation)
import { readFileSync } from 'node:fs'
import { cleanerIssueAlerts } from '@/lib/alerts'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b))
    process.exitCode = 1
  } else {
    console.log('PASS ', m)
  }
}
const src = (f: string) => readFileSync(f, 'utf8')

// ── 1. R-ALERT-04: Cleaner issue alerts ──
const mockIssues = [
  { id: 'c1', job_id: 'j100', date: '2026-11-10', cleaner: 'Pooja', status: 'issue', note: 'Client not opening door' },
  { id: 'c2', job_id: 'j101', date: '2026-11-10', cleaner: 'Rita', status: 'started', note: null },
]
const mockJobs = [
  { id: 'j100', client_name: 'Villa 12, Arabian Ranches', booking_id: 'b555', date: '2026-11-10' }
]

const alerts = cleanerIssueAlerts(mockIssues, mockJobs)
eq(alerts.length, 1, 'only status === issue is returned as alert')
eq(alerts[0].source, 'duties', 'source is duties')
eq(alerts[0].severity, 'high', 'severity is high priority')
eq(alerts[0].title, 'Cleaner Issue: Pooja', 'title names the cleaner')
eq(alerts[0].message.includes('Client not opening door'), true, 'note text in alert message')
eq(alerts[0].links?.some(l => l.label === 'Open Job Sheet'), true, 'direct link to daily job sheet')
eq(alerts[0].links?.some(l => l.label === 'View Booking'), true, 'direct link to booking')

// ── 2. R-EMP-10: Skills and Client Assessment in 3 columns ──
const empForm = src('src/components/employees/EmployeeFormModal.tsx')
eq(/grid grid-cols-1 md:grid-cols-3 gap-3/.test(empForm), true, '3 columns grid layout')
eq(/name="skills"/.test(empForm) && /name="notes"/.test(empForm), true, 'skills and notes fields')
eq(/id="assigned_client_id"/.test(empForm) && /<select/.test(empForm), true, 'client selection dropdown replaces search bar')

// ── 3. R-JOB-09: Team Leader dropdown & address time preservation ──
const addJob = src('src/components/dailyJobSheet/AddJobModal.tsx')
eq(/id="team-leader-select"/.test(addJob), true, 'team leader select dropdown in AddJobModal')
eq(/teamLead && selectedStaff\.includes\(teamLead\)/.test(addJob), true, 'team leader is ordered first in saved staff_name')
eq(/handleSelectClient = \(c: Client/.test(addJob) && !/setStartTime\(sTime\)/.test(addJob), true, 'selecting address does NOT reset time or duty hours')

const newBooking = src('src/components/bookings/NewBookingModal.tsx')
eq(/id="booking-team-leader-select"/.test(newBooking), true, 'team leader select dropdown in NewBookingModal')
eq(/teamLead && selectedStaff\.includes\(teamLead\)/.test(newBooking), true, 'team leader is ordered first in booking crew')

