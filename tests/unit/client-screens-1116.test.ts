// 2026-11-16: Client profile redesign (UX-159) and Clients screen views / one-row toolbar (UX-160)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const prof = readFileSync('src/pages/ClientProfile.tsx', 'utf8')
eq(/Quick Stats Grid/.test(prof), false, 'the cards are no longer inside the header')
eq((prof.match(/<KpiCard /g) || []).length, 6, 'six Daily Job Sheet style cards under the header')
eq(/Account Balance Overview Banner/.test(prof) || /historyCards/.test(prof), false, 'the same totals are not repeated inside the tabs')
eq(/LayoutCustomizer sections=\{\[\{ title: 'Columns'/.test(prof) && !/title: 'Cards'/.test(prof), true, 'Customize keeps only the table columns')
eq(/grid grid-cols-1 lg:grid-cols-5/.test(prof) && /lg:col-span-3 rounded-\[22px\] border border-emerald-200 bg-gradient-to-br from-emerald-50/.test(prof) && /className="lg:col-span-2 h-full"/.test(prof), true, 'Upcoming 60 % (light green) beside Financial Summary 40 %')
eq(/weekday: 'short'/.test(prof) && /weekday: 'long'/.test(prof) && /No cleaner yet/.test(prof), true, 'each visit shows the day, date, time and the cleaners')
eq(/<Widget title="Financial Summary"/.test(prof) && !/💳/.test(prof), true, 'Financial Summary in the theme\'s widget style')

const cl = readFileSync('src/pages/Clients.tsx', 'utf8')
eq(/useState<'grid' \| 'table' \| 'wide'>/.test(cl) && /setViewMode\('wide'\)/.test(cl) && /title="Grid Card View"/.test(cl) && /title="Table View \(Full Width\)"/.test(cl), true, 'Grid Card, Table and Wide Grid like Monthly Clients')
eq(/xl:col-span-2 space-y-4/.test(cl) && /renderInsights\(!wide\)/.test(cl), true, 'Grid Card: widgets on the right; Wide Grid: widgets below')
eq(/Date Range Filter Row/.test(cl), false, 'the separate date row is gone')
eq(/aria-label="Date filter"/.test(cl) && /<option value="custom">Custom Range…<\/option>/.test(cl), true, 'date filter is a dropdown in the same row')
eq(/Showing <span/.test(cl), false, '"Showing X of N clients" replaced by a small count')
