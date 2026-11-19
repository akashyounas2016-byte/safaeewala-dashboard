// R-SYNC-20 / UX-176 / UX-177 (2026-11-19, found in the browser test with TEST Villa 1119)
import { readFileSync } from 'node:fs'
import { getMultiCleanerPaymentInfo } from '@/lib/excelSheet/rows'
import { expandTeamJob } from '@/lib/excelTeams'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const j = (id: string, staff: string, extra: Partial<DailyJob> = {}) => ({ id, date: '2026-11-30', staff_name: staff, start_time: '09:00 AM', end_time: '01:00 PM', duty_hours: 4, address: 'TEST Villa 1119', charges: 0, received: 0, ...extra }) as DailyJob

// Two separate jobs at one address at the same time: Asmita's own job (AED 240) and Kamala's team job
const asmita = j('a', 'Asmita Tamang', { charges: 240, payment_mode: 'Cash' as DailyJob['payment_mode'] })
const team = expandTeamJob(j('t', 'Kamala Khatri, Krishna Bahadur Khadka', { charges: 160, payment_mode: 'Cash' as DailyJob['payment_mode'] }), 'Team B')
const rows = [asmita, ...team]
eq(getMultiCleanerPaymentInfo(asmita, rows)?.isSecondary === true, false, 'a row with its own money is never shown as another lead\'s member (its charges stay)')
eq(getMultiCleanerPaymentInfo(team[1], rows)?.isSecondary, true, 'the real team member still points to the lead')
// An old-style member row without money at the same place and time still follows the lead
const helper = j('h', 'Bina Pun Dhanlal Pun')
eq(getMultiCleanerPaymentInfo(helper, [asmita, helper])?.isSecondary, true, 'a row without money at the same place and time is still a member')

const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/team_name: names\.length > 1 \|\| extras\.length > 0 \?/.test(sheet), true, 'the lead keeps the team name when a member gets their own time (UX-176)')
eq(/const removedJobs = removed\.filter\(r => !isClearedRow\(r\)\)\.length/.test(sheet), true, 'empty filler rows are not counted as deleted in the save message (UX-177)')

// A member saved as its own job (own time, UX-176) points to its own team's lead, not to another job with money there
const krishna = j('k', 'Krishna Bahadur Khadka', { start_time: '10:00 AM', team_name: 'Team B', payment_mode: 'Above' as DailyJob['payment_mode'] })
const kamala = j('t', 'Kamala Khatri', { charges: 160, team_name: 'Team B' })
const solo = j('a', 'Asmita Tamang', { charges: 240, team_name: '' })
const info = getMultiCleanerPaymentInfo(krishna, [solo, kamala, krishna])
eq([info?.isSecondary, info?.primaryCleaner, info?.teamRef], [true, 'Kamala Khatri', 'Team B'], 'a split-off member refers to its own team lead')
eq(getMultiCleanerPaymentInfo(solo, [solo, kamala, krishna]), null, 'a solo job with money at the same place is just a solo job (no other team name saved on it)')
