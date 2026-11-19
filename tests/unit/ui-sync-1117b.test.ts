// UX-169 / UX-170 / UX-171 / R-ATT-09 / R-MKT-05 (2026-11-17)
import { readFileSync } from 'node:fs'
import { rowColoursInUse } from '@/components/common/RowColorMenu'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const jobs = [
  { id: '1', date: '2026-11-17', row_color: 'c05', staff_name: 'Ayesha', address: 'Villa 1' },
  { id: '2', date: '2026-11-17', row_color: 'c07', staff_name: 'Bina', address: 'Office ABC' },
  { id: '3', date: '2026-11-18', row_color: 'c09', staff_name: 'Dinesh', address: 'X' },
  { id: '4', date: '2026-11-17', row_color: 'default', staff_name: 'Gyan', address: 'Y' },
]
eq(rowColoursInUse(jobs, '2026-11-17', ['Dinesh']), { c05: 'Ayesha', c07: 'Bina' }, 'colours of other cleaners that day are taken')
eq(rowColoursInUse(jobs, '2026-11-17', ['Ayesha']), { c07: 'Bina' }, 'the same cleaner may reuse their colour')
eq(rowColoursInUse(jobs, '2026-11-17', ['Dinesh'], 'Office ABC'), { c05: 'Ayesha' }, 'a team project (same address) shares its colour (UX-71)')
const menu = readFileSync('src/components/common/RowColorMenu.tsx', 'utf8')
eq(/already on \$\{usedBy\[id\]\}'s row today/.test(menu) && !/preset\.label\}<\/span>/.test(menu), true, 'used colour warns and is not applied; no colour names shown')
const add = readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')
const book = readFileSync('src/components/bookings/NewBookingModal.tsx', 'utf8')
eq(/usedBy=\{rowColoursInUse\(dailyJobs, date, selectedStaff, address, initial\?\.id\)\}/.test(add) && /usedBy=\{rowColoursInUse\(dailyJobs \|\| \[\], scheduledDate, selectedStaff\)\}/.test(book), true, 'Add Job and New Booking check the colours of the day')
const mc = readFileSync('src/pages/MonthlyClients.tsx', 'utf8')
eq(/Record New Payment|Record First Payment/.test(mc), false, 'UX-170: no second Record Payment button in Recorded Payments')
eq(/MONTHLY_RECORD_PAYMENT_EVENT/.test(readFileSync('src/pages/Clients.tsx', 'utf8')), true, 'UX-170: header Add Payment opens the monthly payment form on the Monthly tab')
eq(/Date Range Filter Bar with Quick Pills/.test(mc), false, 'UX-171: no separate Last 28 Days row')
eq(/UX-171: date range in More Filters, same row as the search/.test(mc), true, 'UX-171: More Filters in the search row')
const qa = readFileSync('src/components/dailyJobSheet/QuickAttendanceModal.tsx', 'utf8')
eq(/Also away today \(office staff, not on the sheet\)/.test(qa), true, 'R-ATT-09: office staff on leave are named in the Excel attendance popup')
const srv = readFileSync('webhookServer.cjs', 'utf8')
eq(/pathname === '\/api\/webhook\/whatsapp-clicks\/log'/.test(srv) && /logWact\(401/.test(srv) && /logWact\(201, rowsIn\.length > 1/.test(srv), true, 'R-MKT-05: every webhook delivery is logged and readable')
const wc = readFileSync('src/pages/WhatsAppClicks.tsx', 'utf8')
eq(/Website connection: /.test(wc) && /setInterval\(\(\) => \{ void load\(\); void loadLog\(\) \}, 60_000\)/.test(wc), true, 'R-MKT-05: screen shows the last delivery and refreshes every minute')

// UX-172 / UX-173
const cp = readFileSync('src/pages/ClientProfile.tsx', 'utf8')
eq(/title="Already a row on the Job Sheet for this date/.test(cp), true, 'UX-172: On sheet shows an info tooltip like Scheduled')
const cl = readFileSync('src/pages/Clients.tsx', 'utf8')
eq(/size="xl"\s*\n\s*className="max-w-4xl"/.test(cl) && /aria-label="Delete client"/.test(cl) && /headerActions=\{selected && !confirmDelete/.test(cl), true, 'UX-173: Client Profile popup wider, Delete icon / Edit Profile / New Booking on top')
eq(/UX-173: Edit \(the client popup\) instead of a second Record Payment/.test(mc) && /<ClientModalForm\s*\n\s*open=\{!!editClient\}/.test(readFileSync('src/pages/MonthlyClients.tsx', 'utf8')), true, 'UX-173: Monthly Client Details has Edit (client popup), no Record Payment on top')
