// Behaviour tests for audit phase 3 helpers
import { extractAllEmployeesFromDailyJobs, extractAllClientsFromDailyJobs } from '@/lib/clientDataSync'
import { matchesAgencyFilter, staffOfAgency } from '@/lib/utils'

let failed = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`)
  if (!cond) failed++
}
const today = new Date().toISOString().split('T')[0]
const old = '2025-01-10'
const job = (o: any) => ({ id: Math.random().toString(36), created_at: '', date: today, staff_name: '', start_time: '09:00', end_time: '13:00',
  duty_hours: 4, address: 'Villa 1', area: 'Dubai', material: 'No', charges: 100, received: 0, payment_mode: 'Cash', is_overtime: false, remarks: '', ...o })

// AUD-08
const emps = extractAllEmployeesFromDailyJobs([
  job({ staff_name: 'Sita, Rupa' }),
  job({ staff_name: 'Oldie', date: old }),
] as any, [] as any)
const names = emps.map(e => e.full_name).sort()
check('no hard-coded roster names', !names.includes('Sharmila') && !names.includes('Qasim'), names)
check('shared row gives two staff', names.includes('Sita') && names.includes('Rupa'), names)
check('staff not seen for 60+ days is inactive', emps.find(e => e.full_name === 'Oldie')?.status === 'inactive')
check('recent staff is active', emps.find(e => e.full_name === 'Sita')?.status === 'active')
check('no role guessed from name', emps.every(e => e.role === 'cleaner'))

// AUD-15
const clients = [{ id: 'c1', full_name: 'Ahmed Khan', total_bookings: 0, total_spent: 0 }]
const out = extractAllClientsFromDailyJobs(
  [job({ booking_id: 'b1', address: 'Marina Gate T2, 1203', charges: 300 })] as any,
  clients as any,
  [{ id: 'b1', client_id: 'c1' }],
)
check('booking row counts for its client', out.find(c => c.id === 'c1')?.total_spent === 300, out)
check('no fake client created from the address', out.length === 1, out.map(c => c.full_name))

// AUD-14
const agencies = [{ id: 'a1', name: 'Gulf Star Recruitment & Facilities', company_type: 'Third Party' }, { id: 'a2', name: 'Gulf', company_type: 'Third Party' }]
const staff = [
  { id: 'e1', agency_id: 'a1', agency_name: 'Gulf Star Recruitment & Facilities' },
  { id: 'e2', agency_name: 'Gulf' },
  { id: 'e3' },
]
check('filter by id → exact agency only', staff.filter(e => matchesAgencyFilter(e, 'a2', agencies)).map(e => e.id).join() === 'e2')
check('filter by slug works', staff.filter(e => matchesAgencyFilter(e, 'gulf-star-recruitment-facilities', agencies)).map(e => e.id).join() === 'e1')
check('parent company owns unassigned staff', staffOfAgency({ id: 'agency-safaeewala', name: 'Safaeewala', company_type: 'Parent Company' }, staff).map(e => e.id).join() === 'e3')

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
