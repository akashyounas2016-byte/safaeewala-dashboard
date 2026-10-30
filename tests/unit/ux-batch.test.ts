// Behaviour tests for the UX batch
import { invoiceBalance, isPartlyPaid, invoicedJobIds, ageBucket } from '@/lib/receivables'
import { calcJobCollectable } from '@/lib/clientDataSync'
import { rangeForPreset, inRange } from '@/lib/datePresets'
import { classifyAttendanceDay } from '@/lib/attendance'
import { findDuplicateLeads, responseInfo } from '@/lib/leads'

let failed = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`)
  if (!cond) failed++
}
const inv = (o: any) => ({ id: 'i', total: 1050, status: 'sent', amount_paid: 0, job_ids: [], ...o }) as any

// UX-17 / UX-18
check('balance = total − paid', invoiceBalance(inv({ amount_paid: 300 })) === 750)
check('paid invoice has no balance', invoiceBalance(inv({ status: 'paid' })) === 0)
check('partly paid detected', isPartlyPaid(inv({ amount_paid: 300 })) && !isPartlyPaid(inv({})))
const ids = invoicedJobIds([inv({ job_ids: ['j1'] }), inv({ status: 'draft', job_ids: ['j2'] })])
check('sent invoice jobs are invoiced, drafts are not', ids.has('j1') && !ids.has('j2'))
const job = { id: 'j1', charges: 200, received: 0, payment_mode: 'Pending', staff_name: 'A' } as any
check('invoiced job not listed as a separate job due', calcJobCollectable(job, undefined, ids) === 0)
check('non-invoiced job still due', calcJobCollectable({ ...job, id: 'j9' }, undefined, ids) === 200)

// UX-09
const now = new Date('2026-10-29T10:00:00')
check('ageing 0-30', ageBucket('2026-10-20', now) === '0-30')
check('ageing 31-60', ageBucket('2026-09-15', now) === '31-60')
check('ageing 60+', ageBucket('2026-07-01', now) === '60+')

// UX-05
const m = rangeForPreset('this_month', undefined, now)
check('this month range', m.start === '2026-10-01' && m.end === '2026-10-31', m)
const lm = rangeForPreset('last_month', undefined, now)
check('last month range', lm.start === '2026-09-01' && lm.end === '2026-09-30', lm)
check('7 days includes today and 6 before', rangeForPreset('7days', undefined, now).start === '2026-10-23')
check('all time contains everything', inRange(rangeForPreset('all', undefined, now), '2001-01-01'))
check('custom without dates = all time', rangeForPreset('custom', {}, now).isAllTime)

// UX-20 shared attendance rule (R-ATT-01..03)
const row = (o: any) => ({ id: 'r', date: '2026-10-29', staff_name: 'Sita', duty_hours: 0, charges: 0, remarks: '', address: 'Villa', ...o }) as any
check('blank day = available', classifyAttendanceDay([]).status === 'available')
check('worked row = present even with "leave keys" remark', classifyAttendanceDay([row({ duty_hours: 4, remarks: 'Leave keys at reception' })]).status === 'present')
check('specifically absent row = absent', classifyAttendanceDay([row({ remarks: 'Absent - sick' })]).status === 'absent')
check('weekly off = on leave', classifyAttendanceDay([row({ remarks: 'weekly off' })]).status === 'on_leave')
check('override wins', classifyAttendanceDay([row({ duty_hours: 4 })], { status: 'absent', updatedAt: '' }).status === 'absent')

// UX-23 / UX-24
const lead = (o: any) => ({ id: Math.random().toString(36), created_at: '2026-10-20T10:00:00Z', phone: '+971 50 123 4567', status: 'new', client_name: 'A', ...o }) as any
const first = lead({ id: 'a' }), second = lead({ id: 'b', created_at: '2026-10-23T10:00:00Z' }), later = lead({ id: 'c', created_at: '2026-11-20T10:00:00Z' })
const dups = findDuplicateLeads([first, second, later])
check('same phone within 7 days = duplicate', dups.get('b')?.id === 'a')
check('same phone after 7 days is not a duplicate', !dups.has('c'))
const answered = responseInfo(lead({ status: 'contacted', responded_at: '2026-10-20T12:00:00Z' }))
check('response time measured', answered?.text === 'answered in 2h', answered)

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
