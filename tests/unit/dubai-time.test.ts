// Business dates follow Dubai time whatever the computer timezone (R-DATA-06)
import { toDubaiDate, calendarDate, addDays } from '@/lib/dubaiTime'
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) { console.log('FAIL', m, a, b); process.exitCode = 1 } else console.log('PASS ', m) }
// 02:30 Dubai on 29 Oct = 22:30 UTC on 28 Oct
eq(toDubaiDate(new Date('2026-10-28T22:30:00Z')), '2026-10-29', 'after midnight Dubai is the new day')
eq(toDubaiDate(new Date('2026-10-29T19:59:00Z')), '2026-10-29', '23:59 Dubai still same day')
eq(toDubaiDate(new Date('2026-10-29T20:00:00Z')), '2026-10-30', '00:00 Dubai next day')
// Excel cell: SheetJS builds local midnight
eq(calendarDate(new Date(2026, 9, 27)), '2026-10-27', 'excel local-midnight date not shifted')
eq(addDays('2026-10-31', 1), '2026-11-01', 'month rollover')
eq(addDays('2026-03-01', -1), '2026-02-28', 'back over Feb')
