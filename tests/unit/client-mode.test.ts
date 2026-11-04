// R-CLI-02: Add New Client → Mode (General / Bi-Weekly / Monthly)
import fs from 'node:fs'
import { biweeklyEndDate, biweeklyVisitDates } from '@/lib/biweekly'
import { isMonthlyClient } from '@/lib/clientDataSync'
import type { Client } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const plan = { days: ['Monday', 'Thursday'], day_schedules: {}, start_date: '2026-11-10', months: 1 }
eq(biweeklyEndDate(plan), '2026-12-09', 'one month from 10 Nov ends 9 Dec')
eq(biweeklyVisitDates(plan), ['2026-11-12', '2026-11-23', '2026-11-26', '2026-12-07'], 'chosen days, every other week, inside the contract')
eq(biweeklyEndDate({ start_date: '2026-01-31', months: 1 }), '2026-02-27', 'month end is clamped')
eq(biweeklyVisitDates({ ...plan, days: [] }), [], 'no days, no visits')

// a Bi-Weekly client is not a monthly client
const bw = { id: 'c1', full_name: 'TEST Bi', service_mode: 'biweekly', biweekly_plan: plan } as unknown as Client
eq(isMonthlyClient(bw, []), false, 'bi-weekly plan does not make the client monthly')

const form = fs.readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
eq(/<option value="general">General<\/option>[\s\S]*<option value="biweekly">Bi-Weekly<\/option>[\s\S]*<option value="monthly">Monthly<\/option>/.test(form), true, 'Mode offers General, Bi-Weekly, Monthly')
eq(!/Enter client name and direct communication/.test(form) && !/Physical service address, community/.test(form), true, 'description lines removed')
eq(/showMonthlyFlow \? \(\s*\/\*[^*]*\*\/\s*<AddMonthlyClientModalForm/.test(form), true, 'Monthly opens the monthly client form')
const sql = fs.readFileSync('supabase/migrations/2026-11-04_clients_service_mode.sql', 'utf8')
eq(/add column if not exists service_mode text/.test(sql) && /add column if not exists biweekly_plan jsonb/.test(sql), true, 'migration adds both columns')
