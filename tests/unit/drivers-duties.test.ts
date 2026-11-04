// R-DRV-04 dispatch by area, UX-82 live map fit, R-DUTY-01 job progress
import fs from 'node:fs'
import { areasOnDate, cleanerSuggestions } from '@/lib/dispatch'
import { fitZoom } from '@/components/drivers/LiveMap'
import { nextStep, checkinId } from '@/lib/jobCheckins'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const J = (id: string, staff: string, area: string, s: string, e: string) => ({ id, date: '2026-11-05', staff_name: staff, area, address: `Site ${id}`, start_time: s, end_time: e, charges: 100, received: 0 }) as unknown as DailyJob
const jobs = [
  J('a', '', 'Al Qusais', '09:00', '12:00'),
  J('b', 'Sita', 'Al Qusais', '13:00', '15:00'),
  J('c', 'Rupa', 'Deira', '09:00', '13:00'),
  J('d', 'Kamala', 'Deira', '14:00', '16:00'),
]
eq(areasOnDate(jobs, '2026-11-05').map(a => [a.area, a.jobs, a.open]), [['Al Qusais', 2, 1], ['Deira', 2, 0]], 'areas with open jobs first')
const s = cleanerSuggestions(jobs, jobs[0], ['Sita', 'Rupa', 'Kamala', 'Adnan'], new Set(['adnan']))
eq(s.map(x => x.name), ['Sita', 'Kamala'], 'same-area cleaner first; busy (Rupa) and away (Adnan) left out')
eq(s[0].sameArea, true, 'Sita is already in Al Qusais today')

eq(fitZoom([{ lat: 25.27, lng: 55.37 }], 800, 420), 14, 'one pin: street zoom')
eq(fitZoom([{ lat: 25.27, lng: 55.37 }, { lat: 25.08, lng: 55.14 }], 800, 420) <= 12, true, 'two far pins: zoomed out to fit')

eq([nextStep(undefined), nextStep('on_way'), nextStep('started'), nextStep('issue'), nextStep('done')], ['on_way', 'started', 'done', 'done', null], 'job steps')
eq(checkinId('j1', ' Sita '), 'j1|sita', 'one check-in per job and cleaner')

const drivers = fs.readFileSync('src/pages/Drivers.tsx', 'utf8')
eq(/text-slate-800 \[color-scheme:light\]/.test(drivers), true, 'header date is readable (DRV-A01)')
eq(/subscribeDriverLocations/.test(drivers) && /<LiveMap/.test(drivers), true, 'live map with realtime positions')
const sql = fs.readFileSync('supabase/migrations/2026-11-04_job_checkins.sql', 'utf8')
eq(/create table if not exists public\.job_checkins/.test(sql) && /supabase_realtime add table public\.driver_locations/.test(sql), true, 'migration: job_checkins + realtime')
