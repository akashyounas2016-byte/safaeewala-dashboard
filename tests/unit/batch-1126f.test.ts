// 2026-11-26 (f): map (R-OPS-25), folded widgets (R-OPS-26), Monthly / Bi-Weekly without tags (R-CLI-18), Expenses 5 cards (R-FIN-24),
// standard invoice pop-up with Discount + VAT (R-FIN-25), cleaning column names (R-FIN-26), Monthly Invoices layout (R-FIN-27)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

const map = src('src/components/overview/LiveOpsMap.tsx')
eq(/L\.latLngBounds\(\[22\.4, 51\.0\], \[26\.4, 56\.8\]\)/.test(map) && /maxBoundsViscosity: 1, minZoom: 7/.test(map), true, 'map stays on the UAE')
eq(/--saf-pin-scale/.test(map) && /z >= 14 \? 1 : z >= 12 \? 0\.85 : z >= 10 \? 0\.72 : 0\.6/.test(map), true, 'pins smaller when zoomed out')
eq(/#2f8f5e_0%/.test(src('src/components/overview/LiveOpsPanel.tsx')), true, 'lighter map header')

const fold = src('src/components/overview/Foldable.tsx')
eq(/export function useFolded\(id: string, defaultFolded = false\)/.test(fold) && /export function FoldSection/.test(fold), true, 'widgets can start folded')
const ov = src('src/pages/Overview.tsx')
eq(['crewCoverage', 'revenueHealth', 'dispatch'].every(id => ov.includes(`<FoldSection id="${id}"`)) && /useFolded\('liveActivity', true\)/.test(ov) && /useFolded\('reports', true\)/.test(src('src/components/overview/ReportsPanel.tsx')), true, 'Reports, Live Activity, Crew / Coverage, Revenue / Health, Dispatch folded at first')

eq(/'All on'|'To follow up'|'All clear'/.test(src('src/pages/MonthlyClients.tsx')), false, 'Monthly cards: no tags')
const cl = src('src/pages/Clients.tsx')
const bw = cl.slice(cl.indexOf('label="Bi-Weekly Clients"'), cl.indexOf('label="Pending Dues"') + 400)
eq(/chip=/.test(bw), false, 'Bi-Weekly cards: no tags')
eq(/chip=\{card\.delta\}[^\n]*chipTop/.test(cl), true, 'general Clients cards keep their tags')

const ex = src('src/pages/Expenses.tsx')
eq(/label="Top Category"/.test(ex) === false && /xl:grid-cols-5 gap-3\.5/.test(ex), true, 'Expenses: five cards, Top Category gone')

const mc = src('src/pages/MonthlyClients.tsx')
eq(/const vatRate = invoiceTaxMode === 'exempt' \? 0 : invoiceTaxMode === 'standard' \? 5/.test(mc) && /invoiceDiscountType === 'percentage'/.test(mc), true, 'Generate Invoice: Discount and VAT Tax Status')
eq(/if \(invoiceOnly\) return generateInvoiceModal/.test(mc), true, 'the same pop-up opens on its own')
const inv = src('src/pages/Invoices.tsx')
eq(/<MonthlyClients invoiceOnly=\{\{ client: invoiceFor/.test(inv) && /function InvoiceClientPicker/.test(inv), true, 'Invoices → New Invoice uses the standard pop-up after choosing the client')
eq(['Duty Hours', 'Price per Hour', 'Charges'].every(l => inv.includes(`>${l}</th>`) && mc.includes(l)) && !/>Unit Price<|>Qty<\/th>/.test(inv), true, 'columns: Duty Hours, Price per Hour, Charges')

const mi = src('src/pages/MonthlyInvoices.tsx')
eq(mi.indexOf('KPI Row') < mi.indexOf('Month Selector + View Toggle'), true, 'Monthly Invoices: cards first, the month / view bar under them')
eq(/statements\.slice\(0, 10\)/.test(mi) && /View all \$\{statements\.length\} statements/.test(mi), true, '10 entries, then View all')
