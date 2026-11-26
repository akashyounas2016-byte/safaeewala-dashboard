// 2026-11-25 (d): Invoices Edit + New Invoice (UX-199); Overview cards, map, crew in motion, dispatch (R-OPS-20)
import { readFileSync } from 'node:fs'
import { crewMotion, fmtMin } from '@/lib/crewMotion'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const D = '2026-11-25'
const job = (id: string, staff: string, s: string, e: string) => ({ id, date: D, staff_name: staff, start_time: s, end_time: e, address: `Villa ${id}`, area: 'Mirdif' }) as never

// R-OPS-20 crew states
const jobs = [job('1', 'Asha', '09:00 AM', '11:00 AM'), job('2', 'Asha', '02:00 PM', '04:00 PM'), job('3', 'Bina, Cara', '10:00 AM', '12:00 PM'), job('4', 'Dina', '08:00 AM', '09:00 AM')]
const at = (min: number, steps: never[] = []) => Object.fromEntries(crewMotion(jobs, steps, D, min).map(c => [c.name, c.state]))
eq(at(600), { Asha: 'working', Bina: 'working', Cara: 'working', Dina: 'done' }, '10:00 — Asha, Bina, Cara cleaning (team row counts each), Dina done')
eq(at(13 * 60 + 30).Asha, 'on_way', '1:30 PM — Asha\'s next job in 30 min → on the way')
eq(at(12 * 60 + 30).Asha, 'later', '12:30 PM — next job at 2 PM → later today')
eq(at(9 * 60 + 30, [{ job_id: '3', cleaner: 'Bina', status: 'on_way' }] as never[]).Bina, 'on_way', 'a My Duties step wins over the clock')
eq(at(20 * 60, [{ job_id: '1', cleaner: 'Asha', status: 'on_way' }] as never[]).Asha, 'done', 'a step never closed stops counting an hour after the job')
eq(crewMotion(jobs, [], D, 630).find(c => c.name === 'Asha')?.progress, 75, 'progress of the job in hand')
eq([fmtMin(9 * 60), fmtMin(13 * 60 + 5), fmtMin(0)], ['9:00 AM', '1:05 PM', '12:00 AM'], 'time label')

const ov = src('src/pages/Overview.tsx')
const order = ['<LiveOpsPanel />', '<LiveActivityPanel', '<ReportsPanel />', "Today's Dispatch & Shifts"].map(x => ov.indexOf(x))
eq(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])) && ov.indexOf('ov-cards grid') < order[0], true, 'cards → Live Map → Live Activity → Reports → … → Dispatch last')
eq(!/>Service<\/th>/.test(ov) && /formatTime12h\(b\.start\)/.test(ov) && /`to \$\{formatTime12h\(b\.end\)\}`/.test(ov), true, 'Dispatch: no Service column, Time = start – end')
eq(/safaeewala_overview_dispatch_hidden/.test(ov) && /aria-label="Columns"/.test(ov), true, 'Dispatch columns can be hidden')
eq(/linear-gradient\(145deg, \$\{iconBg\}/.test(ov) && /ov-card /.test(ov), true, 'cards: light colour of their own, animated')
const panel = src('src/components/overview/LiveOpsPanel.tsx')
eq(/void loadMap\(\)/.test(panel) && /role="separator"/.test(panel) && /MAP_H_MIN = 300, MAP_H_MAX = 1000/.test(panel), true, 'map loads early, height by drag (300–1000)')
eq(/prefers-reduced-motion/.test(src('src/index.css')), true, 'no motion when the user turned it off')

// UX-199 invoices
const inv = src('src/pages/Invoices.tsx')
eq(/aria-label="Edit invoice"/.test(inv) && /Paid invoices cannot be edited/.test(inv), true, 'Edit on unpaid invoices, locked on paid / void')
eq(/initial\?: Invoice; onSave\?: \(patch: InvoicePatch\) => void/.test(inv) && /'Save Changes' : 'Send Invoice'/.test(inv), true, 'Edit uses the same form, filled in')
eq(/the total cannot be less/.test(inv), true, 'total not below what is already paid')
eq(/Pending AED \{Math\.round\(due\)/.test(inv) && !/\{c\.area\}\n\s*<\/span>/.test(inv) && /w-\[min\(680px/.test(inv), true, 'client list: wider, pending status, no area chip')
eq(/title="New Invoice — choose the client"/.test(inv) && /cursor-pointer whitespace-nowrap \$\{/.test(inv) && /whitespace-nowrap cursor-pointer \$\{invoiceTaxMode === k/.test(src('src/pages/MonthlyClients.tsx')), true, 'New Invoice = the standard pop-up (R-FIN-25); VAT options on one row')
eq(/Add line/.test(inv), true, 'several line items')
