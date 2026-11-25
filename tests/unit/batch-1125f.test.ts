// 2026-11-25 (f): My Duties — the right person's jobs, time clash, one job at a time, late starts (R-DUTY-04)
import { readFileSync } from 'node:fs'
import { dutyClashes, startBlockedBy, minutesLate } from '@/lib/dutyChecks'
import { employeeMatchesStaff } from '@/lib/clientDataSync'
import { lateStartAlerts } from '@/lib/alerts'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const ambika = { id: 'a', full_name: 'Ambika', short_name: 'Ambika' } as never
const ambikaD = { id: 'd', full_name: 'Ambika Devi Tharu', short_name: 'Ambika D' } as never
eq([employeeMatchesStaff(ambika, 'Ambika Devi Tharu'), employeeMatchesStaff(ambikaD, 'Ambika Devi Tharu'), employeeMatchesStaff(ambikaD, 'Ambika D'), employeeMatchesStaff({ id: 'r', full_name: 'Rupa Basnet Karki' } as never, 'Rupa Basnet')],
  [false, true, true, true], '"Ambika" no longer gets the jobs of "Ambika Devi Tharu"; a shorter sheet name still matches')

const J = (id: string, s: string, e: string) => ({ id, start_time: s, end_time: e, address: `Site ${id}`, area: 'X', date: '2026-11-25' })
const jobs = [J('1', '09:00', '12:00'), J('2', '11:00', '13:00'), J('3', '16:00', '19:00')]
eq([...dutyClashes(jobs).keys()], ['1', '2'], 'overlapping jobs flagged (touching ones are not)')
eq(startBlockedBy(jobs, id => (id === '1' ? 'started' : undefined), '3')?.id, '1', 'a job cannot start while another is started')
eq(startBlockedBy(jobs, id => (id === '1' ? 'done' : undefined), '3'), null, 'after End job the next one can start')
eq([minutesLate(jobs[2], undefined, '2026-11-25', 16 * 60 + 10), minutesLate(jobs[2], undefined, '2026-11-25', 16 * 60 + 20), minutesLate(jobs[2], 'started', '2026-11-25', 17 * 60), minutesLate(jobs[2], undefined, '2026-11-26', 17 * 60)],
  [0, 20, 0, 0], 'late after 15 minutes without Start; not when started; only today')
const emps = [{ id: 'e1', full_name: 'Misbah Asad Ullah', status: 'active' }, { id: 'e2', full_name: 'Bina', status: 'active' }] as never[]
const alerts = lateStartAlerts([{ ...J('9', '09:00', '12:00'), staff_name: 'Misbah Asad Ullah' }, { ...J('8', '09:00', '12:00'), staff_name: 'Bina' }], [], emps, new Set(['e1']), '2026-11-25', 10 * 60)
eq(alerts.map(a => a.title), ['Not started · Misbah Asad Ullah'], 'office alert only for cleaners with a login (others cannot press Start)')

const md = readFileSync('src/pages/MyDuties.tsx', 'utf8')
eq(/one job at a time/.test(md) && /Not started — \{lateText\(late\)\} late/.test(md) && /new Notification\('Job not started yet'/.test(md), true, 'My Duties: block, banners, phone notification')
