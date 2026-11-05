// Round 2026-11-05 (c): Daily Job Sheet flag, sidebar hide/show, Clients layout, Mode names, optional client name
import { readFileSync } from 'node:fs'
import { clientNameOrAddress, hasClientAddress } from '@/lib/clientAddress'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// UX-86: the flag on the Daily Job Sheet too; the sync note is not shown as remarks text
const dj = src('src/pages/DailyJobSheet.tsx')
eq((dj.match(/<JobFlagIcon flags=\{flagsOfJob\(job\)\}/g) || []).length, 2, 'flag next to the name in both row layouts')
eq(/\{splitSyncNote\(job\.remarks\)\.text \|\| '—'\}/.test(dj), true, 'Remarks show the text without the sync note')

// UX-89: sidebar items can be hidden; the duplicate bottom button is gone
const sb = src('src/components/layout/Sidebar.tsx')
eq(/safaeewala_sidebar_hidden/.test(sb) && /toggleHidden\(item\.to\)/.test(sb), true, 'Eye button hides / shows an item')
eq(/<span className="flex-1 text-left truncate">Customize Items Sequence<\/span>/.test(sb), false, 'bottom Customize Items Sequence button removed')
eq(/moveItem\(item\.to, accessibleItems\[index - 1\]\?\.to\)/.test(sb), true, 'Up / Down move the item itself')

// UX-90: Clients cards over the full width, three per row; widgets below
const cl = src('src/pages/Clients.tsx')
eq(/grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4/.test(cl) && !/Right sidebar widgets/.test(cl), true, 'three cards per row, widgets below')

// UX-91: Mode options show the name only
eq(/desc: 'Direct cash collection on-site'/.test(src('src/pages/JobSheetSpreadsheet.tsx')), false, 'no description under the payment modes')

// R-CLI-03: the client name is optional; the address names the client
eq(clientNameOrAddress('', { apartment: '302', building_name: 'Al Khair Building', area: 'Mirdif' }), '302, Al Khair Building', 'address used when the name is empty')
eq(clientNameOrAddress('Sarah', { apartment: '302', building_name: 'Al Khair' }), 'Sarah', 'a typed name is kept')
eq([hasClientAddress({ area: 'Dubai' }), hasClientAddress({ apartment: 'Villa 25' }), hasClientAddress({ building_name: 'Al Khair' })], [false, true, true], 'an area alone is not an address')
eq(/label="Full Name \(optional\)"/.test(src('src/components/clients/ClientModalForm.tsx')) && /label="Full Name \(optional\)"/.test(src('src/components/monthlyClients/AddMonthlyClientModalForm.tsx')), true, 'name optional in Add Client and Monthly Client')
