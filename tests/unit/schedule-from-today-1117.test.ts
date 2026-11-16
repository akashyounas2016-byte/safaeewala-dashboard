// R-SCHED-21 / R-SCHED-22 / R-CLI-12 / UX-166 (2026-11-17): schedule changes reach the sheet from today on,
// Contract Start stays fixed, other addresses on the sheets, Email next to the contact
import { readFileSync } from 'node:fs'
import { rescheduledVisitRows, jobMatchesClient } from '@/lib/clientDataSync'
import { detailsOfContract } from '@/lib/clientContracts'
import { extraAddressChoices, isExtraAddressOf } from '@/lib/clientAddress'
import type { Client, DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const before = {
  id: 'c1', full_name: 'Office ABC', building_name: 'Office ABC', area: 'JLT', service_days: ['Thursday'],
  day_schedules: { Thursday: { startTime: '09:00', endTime: '15:00', cleaner: 'Ayesha', duration: 6 } },
} as unknown as Client
const row = (id: string, date: string, extra: Partial<DailyJob> = {}) => ({
  id, date, staff_name: 'Ayesha', start_time: '09:00', end_time: '15:00', duty_hours: 6, address: 'Office ABC', area: 'JLT',
  payment_mode: 'Monthly', received: 0, charges: 0, remarks: '(Monthly Schedule)', client_id: 'c1', ...extra,
}) as unknown as DailyJob
// 2026-11-12 / 19 / 26 are Thursdays; 2026-11-18 is a Wednesday
const jobs = [row('past', '2026-11-12'), row('t1', '2026-11-19'), row('t2', '2026-11-26', { staff_name: 'Bina' }), row('moved', '2026-11-18')]
const today = '2026-11-17'

const later = { ...before, day_schedules: { Thursday: { startTime: '10:00', endTime: '17:00', cleaner: 'Dinesh', duration: 7 } } } as unknown as Client
const r1 = rescheduledVisitRows(before, later, jobs, today)
eq(r1.updates.map(u => u.id), ['t1', 't2'], 'only rows from today on change — the past row stays')
eq(r1.updates[0].patch, { start_time: '10:00', end_time: '17:00', duty_hours: 7, staff_name: 'Dinesh' }, 'time, end, hours and cleaner follow the new schedule')
eq(r1.updates[1].patch.staff_name, undefined, 'a cleaner changed by hand on the sheet stays (temporary change, R-SCHED-01)')
eq(r1.removals.length, 0, 'nothing removed while the day stays')

const moved = { ...before, service_days: ['Friday'], day_schedules: { Friday: { startTime: '09:00', endTime: '15:00', cleaner: 'Ayesha', duration: 6 } } } as unknown as Client
const r2 = rescheduledVisitRows(before, moved, jobs, today)
eq(r2.removals.map(j => j.id), ['t1', 't2'], 'day dropped → its rows from today on go (the sync adds the new day)')
eq(r2.removals.some(j => j.id === 'past' || j.id === 'moved'), false, 'past rows and a visit moved by hand are left')

const paid = [row('paid', '2026-11-19', { received: 100 })]
eq(rescheduledVisitRows(before, moved, paid, today).removals.length, 0, 'a paid visit is never removed')

const busy = [row('t1', '2026-11-19'), row('other', '2026-11-19', { staff_name: 'Dinesh', start_time: '11:00', end_time: '13:00', address: 'Villa 9', client_id: 'c9' })]
const r3 = rescheduledVisitRows(before, later, busy, today)
eq([r3.updates[0].patch.staff_name, /already booked/.test(r3.updates[0].patch.remarks || '')], ['', true], 'new cleaner busy then → left without a cleaner, with a note')

// R-SCHED-22
eq(detailsOfContract(undefined, '2026-11-01').startDate, '2026-11-01', 'no contract → Start = the day the client was added, not today')
eq(detailsOfContract({ startDate: '2026-11-05' } as never, '2026-11-01').startDate, '2026-11-05', 'a saved Start is kept')
const form = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq(/always: true/.test(form) && /setContract\(firstDetails\(saved\)\)/.test(form), true, 'popup saves the contract and reads it again on open')

// R-CLI-12
const abd = { id: 'a1', full_name: 'Abdullah', building_name: 'New test 1', area: 'Alwarqa', addresses: [{ id: 'x', label: '', address: 'New Test 2', area: 'Mirdif' }] } as unknown as Client
eq(extraAddressChoices([abd]), [{ key: 'a1__x', address: 'New Test 2', area: 'Mirdif', clientId: 'a1' }], 'other address listed with its own area')
eq([isExtraAddressOf(abd, 'new test 2'), isExtraAddressOf(abd, 'New Test 3')], [true, false], 'matches only its own other address')
eq(jobMatchesClient({ id: 'j', address: 'New Test 2' } as DailyJob, abd), true, 'a job at the other address belongs to the client')
const add = readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')
const xl = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/extraAddressChoices\(clients\)/.test(add) && /extraAddressChoices\(clients\)/.test(xl), true, 'Add Job and Excel address lists include other addresses')

// UX-166
const contact = form.slice(form.indexOf('Primary Contact & Identity'), form.indexOf('Card 2: Address'))
eq(/name="email"/.test(contact), true, 'Email is in the contact row')
const addr = form.slice(form.indexOf('Card 2: Address'))
eq(addr.indexOf('name="building_name"') < addr.indexOf('name="preferred_cleaner"'), true, 'Address comes first in its card, the cleaner after')
