// 2026-11-24: Leads row actions (R-LEAD-16), Daily Job Sheet header (UX-197), Overview redesign (R-OPS-17) and
// editable dispatch (R-OPS-18)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// R-LEAD-16
const ff = src('src/pages/FluentFormsLeads.tsx')
const row = ff.slice(ff.indexOf('title="View full lead submission payload"') - 400, ff.indexOf('title="Delete lead"'))
eq([/setIsEditingLead\(false\)/.test(row), /setIsEditingLead\(true\)/.test(row), /<Pencil size=\{13\} \/>/.test(row)], [true, true, true], 'Fluent Forms row: View, Edit (edit mode), Delete')
const wa = src('src/pages/WhatsAppClicks.tsx')
eq([/function ViewClickModal/.test(wa), /aria-label="View click"/.test(wa), /aria-label="Edit click"/.test(wa), /aria-label="Delete click"/.test(wa)], [true, true, true, true], 'WhatsApp Clicks row: View, Edit, Delete')
eq(/visitor_ip/.test(wa.slice(wa.indexOf('function ViewClickModal'), wa.indexOf('export function WhatsAppClicks'))), true, 'the View window shows the IP and every field')
eq(/onEdit=\{c => \{ setViewing\(null\); setEditing\(c\) \}\}/.test(wa), true, 'Edit from the View window opens the edit pop-up')

// UX-197
const djs = src('src/pages/DailyJobSheet.tsx')
const hdr = djs.slice(djs.indexOf('{/* Right: Date navigation & Action Buttons */}'), djs.indexOf('{/* Three-dot menu'))
const pos = ['<span>Add Job</span>', '<span>Excel Sheet</span>', 'title="Previous Day"', 'onClick={() => setShowRangeMenu(p => !p)}'].map(t => hdr.indexOf(t))
eq(pos.every(n => n > 0) && pos.every((n, i) => i === 0 || n > pos[i - 1]), true, 'header order: Add Job → Excel Sheet → date filters → three dots')
eq(/<span>\{importing \? 'Importing…' : 'Import'\}<\/span>/.test(djs), false, 'no Import button in the header')
eq(/Import Excel/.test(djs.slice(djs.indexOf('{/* Three-dot menu'))), true, 'Import is in the three-dot menu')
eq((djs.match(/spreadsheet\?date=\$\{selectedDate\}/g) || []).length, 1, 'only one Excel Sheet button (header), none under the Jobs widget')

// R-OPS-17
const ov = src('src/pages/Overview.tsx')
// R-OPS-23: the cards now live in cardNodes (shown in the order chosen under "Cards")
const cards = ov.slice(ov.indexOf('const cardNodes'), ov.indexOf('{/* ── Page Hero')) + ov.slice(ov.indexOf('{/* ── KPI Cards'), ov.indexOf('{/* ── R-OPS-20'))
eq((cards.match(/<KpiCard\b/g) || []).length, 12, '12 summary cards (3 full rows of 4)')
eq(/lg:grid-cols-4/.test(cards), true, '4 cards per row')
eq(['Pending Collection', 'Crew Utilization', 'Low Stock Alerts', 'Hours Worked', 'New Clients', 'Expenses'].every(t => cards.includes(t)), true, 'Pending, Crew, Low Stock moved up; Hours, New Clients, Expenses added')
eq(/Ops Alert Cards/.test(ov), false, 'the bottom alert cards are gone')
eq(/<section className="mb-6"><ReportsPanel \/><\/section>/.test(ov) && /<section className="mb-6"><LiveActivityPanel/.test(ov) && /<section className="mb-6"><LiveOpsPanel \/><\/section>/.test(ov), true, 'Reports, Live Activity, Live Map each full width')
const panels = src('src/components/overview/ReportsPanel.tsx') + src('src/components/overview/LiveOpsPanel.tsx') + ov
eq((panels.match(/useFolded\('/g) || []).length, 3, 'all three widgets can be hidden')
eq(/lg:grid-cols-2 gap-5 (mb-6 )?items-stretch/.test(ov) && /lg:grid-cols-10/.test(ov) && /lg:col-span-7/.test(ov) && /lg:col-span-3/.test(ov), true, 'Crew | Coverage 50/50, Revenue | Business Health 70/30')
eq(/'\/daily-jobs'|payment-processing/.test(ov), false, 'no links to pages that do not exist')

// R-OPS-18
eq(/<EditJobModal/.test(ov) && /updateDailyJob\(id, patch\)/.test(ov), true, 'dispatch rows edit through the Job Sheet pop-up')
eq(/canEditJobs = useModuleAccess\('Daily Job Sheet'\)/.test(ov) && /CLOSED_DAYS_KEY/.test(ov), true, 'only with the Daily Job Sheet permission; a closed day is refused')
eq(/dispatchQ/.test(ov) && /aria-label="Search jobs"/.test(ov), true, 'dispatch search')
