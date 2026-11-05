// UX-84 — round 2026-11-05: 3 rows per cleaner block after Add Job; required fields in popups; time list starts at the top
import { placeRowsInCleanerBlocks, padCleanerBlocks, expandTeamJob, MIN_BLOCK_ROWS } from '@/lib/excelTeams'
import { missingFields } from '@/lib/requiredFields'
import type { DailyJob } from '@/types'
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const day = '2026-11-05'
const row = (id: string, staff: string, extra: Partial<DailyJob> = {}) =>
  ({ id, date: day, staff_name: staff, start_time: '', end_time: '', address: '', charges: 0, received: 0, ...extra }) as unknown as DailyJob

// Screenshot 2026-11-05: Arjun, Adnan and Asmita (new to the sheet) got 1–2 rows; Ahmed and Uma had 3
const grid = [
  row('h1', 'Ahmed', { address: 'Nilofer', start_time: '01:00 PM' }), row('h2', 'Ahmed'), row('h3', 'Ahmed'),
  row('u1', 'Uma', { address: 'Nilofer', start_time: '01:00 PM' }), row('u2', 'Uma'), row('u3', 'Uma'),
]
const team = row('j1', 'Arjun Singh, Adnan, Asmita, Ahmed', { address: '45 Apt 123', start_time: '09:00 AM', end_time: '01:00 PM', charges: 500 })
const placed = padCleanerBlocks(placeRowsInCleanerBlocks(grid, expandTeamJob(team, 'Team A')), day)
const count = (name: string) => placed.filter(r => r.staff_name === name).length
eq([count('Arjun Singh'), count('Adnan'), count('Asmita')], [3, 3, 3], 'each new cleaner block has 3 rows')
eq([count('Ahmed'), count('Uma')], [3, 3], 'blocks that already had 3 rows keep 3 (empty row filled first)')
eq(placed.filter(r => r.staff_name === 'Arjun Singh')[0].address, '45 Apt 123', 'the job row comes first in the block')
const blocks = placed.map(r => r.staff_name).filter((n, i, a) => i === 0 || a[i - 1] !== n)
eq(new Set(blocks).size, blocks.length, 'every cleaner is one block, rows next to each other')
eq(MIN_BLOCK_ROWS, 3, 'minimum is 3 rows')
const busy = [row('a', 'Rupa', { address: 'A' }), row('b', 'Rupa', { address: 'B' }), row('c', 'Rupa', { address: 'C' }), row('d', 'Rupa', { address: 'D' })]
eq(padCleanerBlocks(busy, day).length, 4, 'a block with more than 3 jobs gets no extra rows')
eq(padCleanerBlocks([row('x', ''), row('y', '')], day).length, 2, 'unnamed empty rows are not padded')

// Required fields: the message lists only the empty ones, in form order
eq(missingFields([
  { key: 'staff', label: 'Staff Name', ok: false },
  { key: 'date', label: 'Job Date', ok: true },
  { key: 'address', label: 'Address', ok: false },
]).map(r => r.label), ['Staff Name', 'Address'], 'missing fields listed in order')

// Wiring checks (source): the popups use the shared check, and the guard is mounted once
const src = (p: string) => readFileSync(p, 'utf8')
eq(/useRequiredFields\(/.test(src('src/components/dailyJobSheet/AddJobModal.tsx')) && /noValidate/.test(src('src/components/dailyJobSheet/AddJobModal.tsx')), true, 'Add Job Entry checks its required fields')
eq(/useRequiredFields\(/.test(src('src/components/bookings/NewBookingModal.tsx')), true, 'New Booking checks its required fields')
eq(/<FormGuard \/>/.test(src('src/components/layout/Layout.tsx')), true, 'FormGuard mounted for every popup with required fields')
eq(/role="dialog"/.test(src('src/components/ui/Modal.tsx')), true, 'popups are marked as dialogs')
eq(/alert\('Please/.test(src('src/components/monthlyClients/AddMonthlyClientModalForm.tsx') + src('src/components/payments/RecordPaymentModal.tsx') + src('src/pages/MarketingDashboard.tsx') + src('src/pages/RecurringSubscriptions.tsx')), false, 'no browser alerts for missing fields')
eq(/listRef\.current\.scrollTop = 0/.test(src('src/components/common/Time12hPicker.tsx')), true, 'Morning / Evening switch starts the time list at the top')
