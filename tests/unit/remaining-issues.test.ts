// Behaviour tests for the remaining-issues batch
import { extractAllEmployeesFromDailyJobs, extractAllClientsFromDailyJobs, shiftSalaryCost, getEmployeeMonthlySalary, isBogusJob } from '@/lib/clientDataSync'
import { calcEmployeeHealth } from '@/lib/employeeHealth'

let failed = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`)
  if (!cond) failed++
}
const today = new Date().toISOString().split('T')[0]
const job = (o: any) => ({ id: Math.random().toString(36), created_at: '', date: today, staff_name: '', start_time: '09:00', end_time: '13:00',
  duty_hours: 4, address: 'Villa 1', area: 'Dubai', material: 'No', charges: 100, received: 0, payment_mode: 'Cash', is_overtime: false, remarks: '', ...o }) as any

// AUD-17: deleted names stay deleted
const jobs = [job({ staff_name: 'Sita' }), job({ staff_name: 'Rupa' })]
const before = extractAllEmployeesFromDailyJobs(jobs, [] as any).map(e => e.full_name).sort().join()
const after = extractAllEmployeesFromDailyJobs(jobs, [] as any, new Set(['sita'])).map(e => e.full_name).join()
check('job-sheet staff listed', before === 'Rupa,Sita', before)
check('deleted staff not re-created from history', after === 'Rupa', after)
const cl = extractAllClientsFromDailyJobs([job({ address: 'Marina Gate 1203' })] as any, [], [], new Set(['marinagate1203']))
check('deleted client not re-created from history', cl.length === 0, cl.map(c => c.full_name))

// AUD-06 / AUD-09: one salary rule, no invented rates
check('monthly salary used as is', getEmployeeMonthlySalary({ monthly_salary: 2400, pay_rate_hourly: 0 }) === 2400)
check('shift cost from monthly salary (÷200 h)', shiftSalaryCost({ monthly_salary: 2400, pay_rate_hourly: 0 }, 5) === 60)
check('no salary → no cost (was 15/hr)', shiftSalaryCost({ monthly_salary: 0, pay_rate_hourly: 0 }, 5) === 0)

// AUD-16: one-word names do not swallow addresses
const ahmed = extractAllClientsFromDailyJobs([job({ address: 'Ahmed Tower 5, Flat 301', charges: 500 })] as any,
  [{ id: 'c1', full_name: 'Ahmed', total_bookings: 0, total_spent: 0 }] as any)
check('one-word client name does not take "Ahmed Tower" jobs', ahmed.find(c => c.id === 'c1')?.total_spent === 0, ahmed)
const full = extractAllClientsFromDailyJobs([job({ address: 'Villa of Sara Khan, Springs 2', charges: 500 })] as any,
  [{ id: 'c2', full_name: 'Sara Khan', total_bookings: 0, total_spent: 0 }] as any)
check('two-word name still matches its address', full.find(c => c.id === 'c2')?.total_spent === 500, full)

// AUD-21: shared bogus rule includes empty stubs
check('empty stub row is ignored everywhere', isBogusJob(job({ address: '', charges: 0, received: 0, service: '' })))
check('real row kept', !isBogusJob(job({})))

// AUD-38: health score reads id-keyed overrides
localStorage.setItem('safaeewala_cleaner_attendance_overrides', JSON.stringify({ [`${today}_id:e7`]: { status: 'absent', reason: 'Sick' } }))
const h = calcEmployeeHealth({ id: 'e7', full_name: 'Renamed Person' } as any, [])
check('absence keyed by id is counted after a rename', h.absences.length === 1, h.absences)

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
