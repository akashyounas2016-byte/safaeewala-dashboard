// 2026-11-26 (e): Clients / Monthly / Bi-Weekly cards in the Daily Job Sheet design, tags at the top (R-CLI-17)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const kc = src('src/components/ui/KpiCard.tsx')
eq(/chip && chipTop &&/.test(kc) && /chip && !chipTop &&/.test(kc), true, 'a card can carry its tag at the top, under the title')
const cl = src('src/pages/Clients.tsx')
eq(/chip=\{card\.delta\} chipTone=\{card\.deltaUp \? 'up' : 'down'\} chipTop/.test(cl), true, 'Clients cards: the shared design, tag at the top')
eq(!/label="Contracts Off"/.test(cl) && /xl:grid-cols-5 gap-3\.5">\s*<KpiCard label="Bi-Weekly Clients"/.test(cl), true, 'Bi-Weekly: five cards (Contracts Off removed)')
eq(/label="Pending Dues"[^\n]*'To follow up'[^\n]*chipTop/.test(cl), true, 'To follow up sits with Pending Dues')
const mc = src('src/pages/MonthlyClients.tsx')
eq(/\{embedded \? null : \(/.test(mc) && !/Monthly Clients<\/span> · Billed AED/.test(mc), true, 'Monthly tab: no tagline between the tabs and the cards')
eq((mc.match(/<KpiCard label="/g) || []).length, 6, 'Monthly: six cards in the same design')
