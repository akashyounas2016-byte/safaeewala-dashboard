// UX-167 (2026-11-17): one row-colour menu for Add Job (Daily + Excel) and New Booking
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const add = readFileSync('src/components/dailyJobSheet/AddJobModal.tsx', 'utf8')
const book = readFileSync('src/components/bookings/NewBookingModal.tsx', 'utf8')
const menu = readFileSync('src/components/common/RowColorMenu.tsx', 'utf8')
eq(/<RowColorMenu value=\{rowColor\}/.test(add) && /<RowColorMenu value=\{rowColor\}/.test(book), true, 'Add Job and New Booking use the same colour menu')
eq(/Select Row Theme/.test(book) || /Select Row Color \(\{ROW_COLOR_PRESETS\.length\}\)/.test(add), false, 'old separate menus are gone')
eq(/style=\{\{ backgroundColor: preset\.circleColor \}\}/.test(menu), true, 'each choice is filled with its colour')
