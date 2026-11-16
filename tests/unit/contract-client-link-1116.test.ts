// 2026-11-16 audit: contract Start / End typed alone were never saved (R-SCHED-19); editing a client built from
// sheet rows left the old name as a second client (R-CLI-06). "Cloud Test" records only.
import { readFileSync } from 'node:fs'
import { saveClientContract, contractOfClient, CONTRACTS_KEY, emptyContractDetails } from '@/lib/clientContracts'
import { contractWindowOf, getScheduledMonthlyShiftsForDate, markInitialDataLoaded } from '@/lib/clientDataSync'
import type { Client, RecurringContract } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
localStorage.setItem(CONTRACTS_KEY, '[]')

// only dates → saved
const datesOnly = { ...emptyContractDetails(), startDate: '2026-11-20', endDate: '2026-12-20' }
saveClientContract({ clientName: 'Cloud Test Qamar', details: datesOnly, active: true })
const c = contractOfClient('Cloud Test Qamar')
eq([c?.startDate, c?.endDate], ['2026-11-20', '2026-12-20'], 'Start / End alone are saved (were lost on refresh)')

// untouched card (today, nothing else) → nothing created
saveClientContract({ clientName: 'Cloud Test Empty', details: emptyContractDetails(), active: true })
eq(contractOfClient('Cloud Test Empty'), undefined, 'an untouched card still creates no contract')

// the saved dates now limit the visits on the sheet
markInitialDataLoaded()
const qamar = { id: 'cq', full_name: 'Cloud Test Qamar', building_name: 'Villa# 6', area: 'Mirdif', city: 'Dubai', service_days: ['Tuesday', 'Wednesday', 'Friday'], scheduled_time: '09:00', end_time: '13:00', preferred_cleaner: 'Cloud Test Nobel', created_at: '2026-11-01T00:00:00Z' } as unknown as Client
const contracts = JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]') as RecurringContract[]
eq(contractWindowOf(qamar, contracts), { start: '2026-11-20', end: '2026-12-20' }, 'window = the saved contract dates')
const visitsOn = (d: string) => getScheduledMonthlyShiftsForDate(d, [qamar], []).pendingSyncCount
eq([visitsOn('2026-11-18'), visitsOn('2026-11-20'), visitsOn('2026-12-23')], [0, 1, 0], 'no visit before Start or after End; visits inside')

// R-CLI-06 wiring
const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/function linkRowsToClient\(client: Client, id: string\)/.test(ctx) && /dbUpdate\('daily_jobs', j\.id, \{ client_id: id \}\)/.test(ctx), true, 'the client\'s sheet rows get its id')
eq(/if \(before && \(identityChanged \|\| !clients\.some\(c => c\.id === id\)\)\) linkRowsToClient\(before, id\)/.test(ctx) && /if \(fromRows\) linkRowsToClient\(fromRows, row\.id\)/.test(ctx), true, 'on rename / new address and when a sheet-built client is saved (both save paths)')
eq(/R-SCHED-19/.test(readFileSync('rules.md', 'utf8')) && /R-CLI-06/.test(readFileSync('rules.md', 'utf8')), true, 'rules written')
