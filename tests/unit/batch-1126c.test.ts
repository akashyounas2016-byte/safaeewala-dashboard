// 2026-11-26 (c): Payments cards + client links (R-FIN-23); Staff on Duty wording (R-EMP-19); Clients tab cards (R-CLI-16)
import { readFileSync } from 'node:fs'
import { countStaffOnJobs } from '@/lib/clientDataSync'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

const hub = src('src/pages/PaymentsHub.tsx')
eq(!/'To collect'/.test(hub), true, 'no "To collect" tag on the Outstanding card')
const pp = src('src/pages/PendingPayments.tsx')
eq(/<Link to=\{`\/clients\/\$\{rec\.clientId\}`\}/.test(pp) && /clientId: linked\?\.id/.test(pp), true, 'client name opens the profile')

// R-EMP-19: 26 Nov — 11 jobs, 10 cleaners (one has two jobs)
const day = [['Sabirti'], ['Uma'], ['Sita'], ['Asmita'], ['Nim Kumari Shahu'], ['Rupa'], ['Shanti'], ['Nim Kumari Shahu'], ['Soni'], ['Ayesha'], ['Ambika']].map(([n], i) => ({ id: String(i), staff_name: n }))
eq([day.length, countStaffOnJobs(day as never[])], [11, 10], '11 jobs, 10 cleaners on duty (each counted once)')
eq(/Cleaners with a job · each once/.test(src('src/components/dailyJobSheet/JobSheetKPIs.tsx')), true, 'the card says what it counts')

const cl = src('src/pages/Clients.tsx')
eq(/\{shownTab === 'general' && \(<>/.test(cl) && /shownTab === 'biweekly' && \(/.test(cl), true, 'general cards only on the Clients tab; Bi-Weekly has its own')
eq(cl.indexOf('aria-label="Client type"') < cl.indexOf('KPI Summary Cards'), true, 'tab bar above the cards')
eq(['Bi-Weekly Clients', 'Contracts On', 'Contracts Off', 'Visits This Week', 'Visits This Month', 'Pending Dues'].every(l => cl.includes(`label="${l}"`)), true, 'the six Bi-Weekly cards')
