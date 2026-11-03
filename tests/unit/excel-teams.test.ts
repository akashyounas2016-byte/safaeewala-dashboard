// UX-66 / R-SYNC-08 — Excel Job Sheet: a team job is one row per cleaner, all rows of a team share one colour
import { expandTeamJob, nextTeamRef, placeRowsInCleanerBlocks, buildTeamColorMap, TEAM_COLORS } from '@/lib/excelTeams'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const day = '2026-11-03'
const row = (id: string, staff: string, extra: Partial<DailyJob> = {}) =>
  ({ id, date: day, staff_name: staff, start_time: '', end_time: '', address: '', charges: 0, received: 0, ...extra }) as unknown as DailyJob

// Add Job with three cleaners → three rows, the lead keeps the money
const job = row('new-1', 'Ambika, Rupa, Sita', { address: 'Villa 9', start_time: '09:00 AM', end_time: '01:00 PM', charges: 300, received: 100, payment_mode: 'Cash' as DailyJob['payment_mode'] })
const rows = expandTeamJob(job, 'Team B')
eq(rows.map(r => r.staff_name), ['Ambika', 'Rupa', 'Sita'], 'one row per cleaner')
eq(rows.map(r => r.charges), [300, 0, 0], 'lead row holds the charges')
eq(rows.map(r => r.payment_mode), ['Cash', 'Above', 'Above'], 'other rows point to the lead')
eq(rows.map(r => (r as unknown as { _originalJobId: string })._originalJobId), ['new-1', 'new-1', 'new-1'], 'all rows belong to one job (folded on Save)')
eq(rows[0].id, 'new-1', 'lead keeps the job id')
eq(expandTeamJob(row('s', 'Ambika'), '').length, 1, 'a solo job stays one row')

// Next free team letter on that date
eq(nextTeamRef([row('a', 'X', { team_name: 'Team A' }), row('b', 'Y', { team_name: 'Team C' })], day), 'Team B', 'first unused letter')
eq(nextTeamRef([row('a', 'X', { team_name: 'Team A', date: '2026-11-04' })], day), 'Team A', 'other dates do not count')

// Rows land in each cleaner's block: an empty shift row is used first, else after the block, else a new block on top
const grid = [
  row('a1', 'Ambika', { address: 'Office', start_time: '08:00 AM' }),
  row('a2', 'Ambika'),                       // empty shift row
  row('r1', 'Rupa', { address: 'Shop', start_time: '07:00 AM' }),
  row('k1', 'Kamla', { address: 'Flat', start_time: '07:00 AM' }),
]
const placed = placeRowsInCleanerBlocks(grid, rows)
eq(placed.map(r => r.id), ['new-1-cleaner-sita', 'a1', 'new-1', 'r1', 'new-1-cleaner-rupa', 'k1'], 'filled empty row, after block, new block on top')

// Team colours: same team → same colour, next team → next colour, solo → none
const teamOf = (r: DailyJob) => (r.team_name ? `${r.date}|${r.team_name}` : null)
const colourRows = [row('1', 'A', { team_name: 'Team A' }), row('2', 'B'), row('3', 'C', { team_name: 'Team B' }), row('4', 'D', { team_name: 'Team A' })]
const map = buildTeamColorMap(colourRows, teamOf)
eq(map.get(`${day}|Team A`), TEAM_COLORS[0], 'first team gets the first colour')
eq(map.get(`${day}|Team B`), TEAM_COLORS[1], 'second team gets the next colour')
eq(map.size, 2, 'solo rows get no team colour')
eq(TEAM_COLORS.some(c => c.bg.toLowerCase() === '#f0fdfa'), false, 'no team colour equals the solo colour')

// Screenshot 2026-10-19: two different teams were both "Team A" — names are unique per date
import { uniqueTeamRefs } from '@/lib/excelTeams'
import { findAllClashes } from '@/lib/shiftClash'
const teams = [
  row('t1', 'Raju Kumar, Rahul, Qasim', { team_name: 'Team A' }),
  row('t2', 'Adnan, Arjun Singh, Bilal Hassan', { team_name: 'Team A' }),
  row('t3', 'Sita, Rupa', { team_name: '' }),
  row('t4', 'Gita, Mina', { team_name: 'Team A', date: '2026-11-04' }),
  row('solo', 'Kamla', { team_name: 'Team A' }),
]
const refs = uniqueTeamRefs(teams)
eq([refs.get('t1'), refs.get('t2'), refs.get('t3')], ['Team A', 'Team B', 'Team C'], 'second "Team A" on the same date is renamed')
eq(refs.get('t4'), 'Team A', 'another date may use Team A again')
eq(refs.has('solo'), false, 'a solo job gets no team name')

// R-JOB-01: Adnan twice 09:00–13:00 (screenshot) is found; rows of one team job never clash
const shifts = [
  { id: 'a1', date: day, staff_name: 'Adnan', start_time: '09:00 AM', end_time: '01:00 PM', address: 'acsddd', _originalJobId: 'j1' },
  { id: 'a2', date: day, staff_name: 'Arjun Singh', start_time: '09:00 AM', end_time: '01:00 PM', address: 'acsddd', _originalJobId: 'j1' },
  { id: 'a3', date: day, staff_name: 'Adnan', start_time: '09:00 AM', end_time: '01:00 PM', address: 'today testing ABC' },
  { id: 'a4', date: day, staff_name: 'Arjun Singh', start_time: '09:00 AM', end_time: '01:00 PM', address: '809 Al qusais' },
  { id: 'a5', date: day, staff_name: 'Adnan', start_time: '01:00 PM', end_time: '03:00 PM', address: 'later' },
]
const clashes = findAllClashes(shifts)
eq(clashes.map(c => `${c.staff}:${c.a.id}-${c.b.id}`), ['Adnan:a1-a3', 'Arjun Singh:a2-a4'], 'both double bookings found, team rows and back-to-back shifts are fine')

// Screenshot 2026-11-03: 7 cleaner rows at 2 locations were counted as 7 projects — a project is location + date
import { projectKey } from '@/lib/excelTeams'
const at = (address: string, date = day) => ({ date, address })
eq(projectKey(at('today testing ABC'), 'Team Abv'), projectKey(at('Today Testing ABC '), 'Team B'), 'same location = same project, whatever the team name')
eq(projectKey(at('today testing ABC'), 'Team Abv') === projectKey(at('809 Al qusais'), 'Team Abv'), false, 'another location is another project')
eq(projectKey(at('today testing ABC', '2026-11-04'), 'T') === projectKey(at('today testing ABC'), 'T'), false, 'another date is another project')
const rowsAtTwoPlaces = ['A', 'B', 'C', 'D', 'E'].map(() => at('today testing ABC')).concat([at('809 Al qusais'), at('809 Al qusais')])
eq(new Set(rowsAtTwoPlaces.map(r => projectKey(r, 'x'))).size, 2, '7 cleaner rows at 2 locations = 2 projects')
const colours = buildTeamColorMap(rowsAtTwoPlaces.map((r, i) => ({ ...r, id: String(i) }) as unknown as DailyJob), r => projectKey(r, 'x'))
eq(colours.size === 2 && colours.get(projectKey(at('today testing ABC'), 'x')!) !== colours.get(projectKey(at('809 Al qusais'), 'x')!), true, 'each project its own colour')
