// UX-168 (2026-11-17): one row of tabs on Clients — Clients (all) · Monthly (the Monthly Clients screen) · Bi-Weekly
import { readFileSync } from 'node:fs'
import { TABS_IN_PAGE } from '@/lib/moduleGroups'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const page = readFileSync('src/pages/Clients.tsx', 'utf8')
const monthly = readFileSync('src/pages/MonthlyClients.tsx', 'utf8')
const tabs = readFileSync('src/components/layout/ModuleTabs.tsx', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
eq(TABS_IN_PAGE.has('/clients') && /TABS_IN_PAGE\.has\(parent\)\) return null/.test(tabs), true, 'no Clients | Monthly Clients bar on top')
eq(/shownTab === 'general' \|\| modeOfClient\(c\) === shownTab/.test(page) && /general: clients\.length/.test(page), true, 'Clients tab lists and counts every client')
eq(/shownTab === 'monthly' \? <MonthlyClients embedded \/>/.test(page), true, 'Monthly tab shows the Monthly Clients screen (cards, payments, contracts)')
eq(/embedded \? (\(|null : \()/.test(monthly) && /export function MonthlyClients\(\{ embedded = false(, invoiceOnly)? \}/.test(monthly), true, 'embedded Monthly screen has no header of its own')
eq(/useModuleAccess\('Monthly Clients'\)/.test(page) && /id !== 'monthly' \|\| canMonthly/.test(page), true, 'Monthly tab only for who may open Monthly Clients')
eq(/path="monthly-clients" element=\{<Navigate to="\/clients\?tab=monthly"/.test(app), true, 'old /monthly-clients link opens the Monthly tab')
