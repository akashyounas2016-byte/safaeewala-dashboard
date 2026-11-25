// 2026-11-25 (e): Payments cards 5 a row (R-FIN-22); live map — names, place, same-place hub, Technical instead of CSR, steps of any job date, who is not on the map (R-OPS-21)
import { readFileSync } from 'node:fs'
import { buildLivePeople, unplacedOnDuty, liveRoleOf } from '@/lib/liveOps'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const today = '2026-11-25'
const now = Date.parse('2026-11-25T17:00:00Z') // 21:00 Dubai
const emp = (id: string, full_name: string, role: string) => ({ id, full_name, role, status: 'active' }) as never
const employees = [emp('a', 'Ayesha Gimhani', 'cleaner'), emp('b', 'Bina', 'cleaner'), emp('c', 'Cara CSR', 'csr'), emp('t', 'Tariq', 'technical')]
const jobs = [
  { id: 'j24', date: '2026-11-24', staff_name: 'Ayesha Gimhani', start_time: '15:00', end_time: '18:00', address: 'Villa 4-34B', area: 'Mirdif' },
  { id: 'jb', date: today, staff_name: 'Bina', start_time: '08:00 PM', end_time: '10:00 PM', address: 'Tower 9', area: 'JLT' },
] as never[]
const ck = [{ id: 'x', job_id: 'j24', date: '2026-11-24', cleaner: 'Ayesha Gimhani', employee_id: 'a', status: 'started', lat: 25.2, lng: 55.4, updated_at: '2026-11-25T16:42:18Z' }] as never[]
const people = buildLivePeople({ employees, locations: [], checkins: ck, dailyJobs: jobs, date: today, nowMs: now, nowMin: 21 * 60 })
eq(people.map(p => [p.name, p.place]), [['Ayesha Gimhani', 'Villa 4-34B, Mirdif (started)']], 'a job of yesterday started today is on the map, with the place named')
const un = unplacedOnDuty({ employees, dailyJobs: jobs, checkins: ck, date: today, nowMs: now, nowMin: 21 * 60, placed: new Set(people.map(p => p.id)) })
eq(un.map(u => u.name), ['Bina'], 'a cleaner on a job now without a position is listed under the map')
eq([liveRoleOf({ role: 'csr' } as never), liveRoleOf({ role: 'technical' } as never), liveRoleOf({ role: 'ducting' } as never), liveRoleOf({ role: 'driver' } as never)], [null, 'technical', 'technical', 'driver'], 'CSR not tracked; technical team has its own filter')

const map = src('src/components/overview/LiveOpsMap.tsx')
eq(/\$\{esc\(p\.name\)\}<\/span>\s*<\/div>`/.test(map) && !/initials\(p\.name\)/.test(map), true, 'the full name under each pin (no initials, no robot)')
eq(/Now at:/.test(map) && /nominatim\.openstreetmap\.org\/reverse/.test(map) && /toFixed\(3\)/.test(map), true, 'hover shows where they are (job step place, else a ~100 m lookup, cached)')
eq(/at the same place/.test(map) && /L\.polyline\(\[\[lat, lng\], at\]/.test(map) && /map\.on\('zoomend', redo\)/.test(map), true, 'same place: a centre point with a line to each person, kept on zoom')
const panel = src('src/components/overview/LiveOpsPanel.tsx')
eq(/label: 'Technical'/.test(panel) && !/label: 'CSR'/.test(panel), true, 'Technical filter instead of CSR')
eq(/useJobCheckinsFor\(\[addDays\(today, -1\), today\]\)/.test(panel) && /No position yet/.test(panel), true, 'live steps of yesterday and today; on-duty vs on-map count')

const hub = src('src/pages/PaymentsHub.tsx')
eq(!/id: 'high_value'/.test(hub) && !/id: 'active_contracts'/.test(hub), true, 'High Value and Active Contracts cards removed')
const ids = [...hub.matchAll(/\{ id: '([a-z_]+)', label:/g)].map(m => m[1]).slice(0, 5)
eq(ids, ['outstanding', 'collected', 'recovered', 'contracts', 'advance'], 'first row = the five cards of before')
eq(/lg:grid-cols-5 auto-rows-fr/.test(hub) && /visible\.slice\(0, cardRows \* 5\)/.test(hub) && /aria-label="Show more cards"/.test(hub), true, '5 a row, same size, one row at first, View more for the next')
