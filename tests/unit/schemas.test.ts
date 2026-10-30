// Shared data rules (TA-19) used by the Excel import preview (VAL-12)
import { dailyJobSchema, employeeSchema, clientSchema, problemsOf } from '@/lib/schemas'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }
const job = { date: '2026-10-31', staff_name: 'TEST Rupa', start_time: '09:00 AM', end_time: '13:00', duty_hours: 4, address: 'TEST Villa', charges: 200, received: 0, payment_mode: 'Cash' }
eq(problemsOf(dailyJobSchema, job), [], 'valid job row passes')
eq(problemsOf(dailyJobSchema, { ...job, payment_mode: 'Card' }).length, 1, 'unknown payment mode flagged')
eq(problemsOf(dailyJobSchema, { ...job, charges: -50 })[0], 'charges: Cannot be negative', 'negative charges flagged in plain words')
eq(problemsOf(dailyJobSchema, { ...job, duty_hours: 30 })[0], 'duty_hours: More than 24 duty hours', 'over 24 hours flagged')
eq(problemsOf(dailyJobSchema, { ...job, start_time: 'morning' }).length, 1, 'unreadable time flagged')
eq(problemsOf(dailyJobSchema, { ...job, staff_name: '  ' })[0], 'staff_name: Staff name is missing', 'missing staff flagged')
eq(problemsOf(employeeSchema, { full_name: 'TEST', emirates_id: '784-1990-1234567-1' }), [], 'formatted Emirates ID passes')
eq(problemsOf(employeeSchema, { full_name: 'TEST', emirates_id: '12345' }).length, 1, 'bad Emirates ID flagged')
eq(problemsOf(clientSchema, { full_name: 'TEST', phone: '050', email: 'not-an-email' }).length, 1, 'bad email flagged')
eq(problemsOf(clientSchema, { full_name: 'TEST', phone: '050', email: '' }), [], 'empty email allowed')
