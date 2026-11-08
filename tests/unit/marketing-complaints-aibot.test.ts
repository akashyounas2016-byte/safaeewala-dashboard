// R-MKT-01 client segments, R-CMP-01 complaints, R-AI-01 AI Bot hub, UX-115 Invoices, UX-116 Inventory
import { readFileSync } from 'node:fs'
import { segmentsOf, segmentCounts, audienceOf, offerText, offerLive, fillMessage } from '@/lib/marketing'
import { looksLikeComplaint, nextComplaintRef, complaintSummary } from '@/lib/complaints'
import { monthStaffHours, hubSearch, wantsBooking, employeeInQuestion, splitStaff } from '@/lib/aiHub'
import { moduleForPath } from '@/lib/permissions'
import type { DailyJob, Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const now = new Date('2026-11-09T10:00:00Z').getTime()
const C = [
  { full_name: 'A', phone: '0501111111', total_bookings: 1, last_service: '2026-11-01' },   // first-time, active
  { full_name: 'B', phone: '0502222222', total_bookings: 3, last_service: '2026-07-01' },   // repeat, inactive
  { full_name: 'C', phone: '', total_bookings: 0, last_service: undefined },                 // never, no phone
  { full_name: 'D', whatsapp: '+971503333333', total_bookings: 0, last_service: undefined }, // never
] as never[]
eq(segmentsOf(C[0], now), ['all', 'first_time', 'active'], 'one recent visit = first-time + active')
eq(segmentsOf(C[1], now), ['all', 'repeat', 'inactive'], '3 visits, last in July = repeat + inactive (60 days)')
const counts = segmentCounts(C, now)
eq([counts.all, counts.inactive, counts.first_time, counts.never], [3, 1, 1, 1], 'counts only clients with a phone')
eq(audienceOf(C, 'never', now).map((c: { full_name: string }) => c.full_name), ['D'], 'never-booked audience')
eq([offerText({ discount_type: 'percent', discount_value: 20 }), offerText({ discount_type: 'free_hours', discount_value: 2 })], ['20% off', '2 free hours'], 'offer text')
eq([offerLive({ active: true, valid_from: '2026-11-01', valid_to: '2026-11-30' }, '2026-11-09'), offerLive({ active: true, valid_from: null, valid_to: '2026-11-01' }, '2026-11-09')], [true, false], 'offer live only inside its dates')
eq(fillMessage('Hi {name}, we miss you', 'Sara Khan'), 'Hi Sara, we miss you', '{name} = first name')

eq([looksLikeComplaint('The cleaner did not come'), looksLikeComplaint('Need deep cleaning on Friday'), looksLikeComplaint('sofa was damaged')], [true, false, true], 'complaint words found, normal requests not')
eq(nextComplaintRef(['CMP-0002', null, 'CMP-0010']), 'CMP-0011', 'next reference')
const sum = complaintSummary([
  { status: 'open', priority: 'high', created_at: '2026-11-01T10:00:00Z', resolved_at: null },
  { status: 'resolved', priority: 'low', created_at: '2026-11-08T10:00:00Z', resolved_at: '2026-11-08T16:00:00Z' },
], now)
eq([sum.open, sum.high, sum.overdue, sum.resolved, sum.avgHours], [1, 1, 1, 1, 6], 'summary: open, high, over 2 days, resolved, avg hours')

const jobs = [
  { id: '1', date: '2026-11-03', staff_name: 'Fatima, Rupa', start_time: '09:00 AM', end_time: '01:00 PM', duty_hours: 4, address: 'X', area: '', charges: 100, received: 100 },
  { id: '2', date: '2026-11-04', staff_name: 'Fatima', start_time: '06:00 PM', end_time: '10:00 PM', duty_hours: 4, address: 'Y', area: '', charges: 100, received: 0 },
  { id: '3', date: '2026-10-30', staff_name: 'Fatima', start_time: '09:00 AM', end_time: '01:00 PM', duty_hours: 4, address: 'Z', area: '', charges: 0, received: 0 },
] as unknown as DailyJob[]
const ot = monthStaffHours(jobs, '2026-11')
eq(ot.map(r => [r.name, r.jobs, r.hours, r.ot]), [['Fatima', 2, 8, 2], ['Rupa', 1, 4, 0]], 'month hours / OT per cleaner (after 8 PM = OT), other months left out')
eq(splitStaff('Ali & Sara and Mina'), ['Ali', 'Sara', 'Mina'], 'team names split')
const emps = [{ id: 'e1', full_name: 'Fatima Bibi', status: 'active', phone: '050', role: 'cleaner' }] as unknown as Employee[]
eq(employeeInQuestion('fatima ka OT kitna hai', emps)?.id, 'e1', 'a cleaner named in the question is found')
eq([wantsBooking('new booking for Marina'), wantsBooking('pending payments')], [true, false], 'booking intent')
eq(hubSearch('fat', { employees: emps, clients: [], bookings: [], invoices: [] }).map(h => h.kind), ['employee'], 'one search across modules')

eq([moduleForPath('/marketing'), moduleForPath('/complaints'), moduleForPath('/ai-bot')], ['Marketing', 'Complaints', 'AI Bot'], 'own screens in Roles & Access')
const sql = readFileSync('supabase/migrations/2026-11-09_marketing_complaints.sql', 'utf8')
eq(['marketing_offers', 'marketing_campaigns', 'complaints'].every(t => sql.includes(`create table if not exists public.${t}`) && sql.includes(`alter table public.${t} enable row level security`)), true, 'migration: 3 tables with RLS')

const inv = readFileSync('src/pages/Invoices.tsx', 'utf8')
eq(/xl:grid-cols-5/.test(inv) && !/label="VAT Collected"/.test(inv) && /showSearch=\{false\}/.test(inv) && /aria-label="Reset filters"/.test(inv), true, 'Invoices: 5 KPI cards, no VAT card, no header search, one filter row with Reset')
const invt = readFileSync('src/pages/Inventory.tsx', 'utf8')
eq(/<KpiCard label="Total Items"/.test(invt) && /md:grid-cols-3 gap-5 items-start/.test(invt) && !/xl:col-span-2 space-y-4/.test(invt), true, 'Inventory: DJS cards, full-width list, widgets in one row at the bottom')
