// 2026-11-26 (b): app location always on (R-APP-03); Daily Job Sheet cards + Bookings cards (R-SHEET-06); Bookings views (R-SHEET-07)
import { readFileSync } from 'node:fs'
import { JOB_SHEET_EXTRA_CARDS } from '@/components/dailyJobSheet/JobSheetKPIs'
import { JOB_SHEET_VIEWS } from '@/components/dailyJobSheet/JobViews'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// R-APP-03
eq(/if \(employeeId && \(isNativeApp\(\) \|\| safeLocalStorageGet<boolean>\(shareKey\(employeeId\), false\)\)\) start\(\)/.test(src('src/lib/useLiveSharing.ts')), true, 'in the app location starts by itself (permission asked when it opens)')
const md = src('src/pages/MyDuties.tsx')
eq(/kind === 'cleaner' && linked && !inApp && \(/.test(md) && /\{!inApp && \(\s*<button type="button" onClick=\{toggleSharing\}/.test(md), true, 'no on / off button in the app (cleaner and driver); the browser keeps it')
eq(/Location is on — the office sees you on the map/.test(md), false, 'no status line while it works (R-APP-05: owner asked to remove it)')

// R-SHEET-06
eq(JOB_SHEET_EXTRA_CARDS, ['scheduled', 'live', 'completed', 'monthly_jobs', 'billed', 'duty_hours'], 'the Bookings cards not already on the sheet, hidden at first')
const k = src('src/components/dailyJobSheet/JobSheetKPIs.tsx')
eq(/useCardPrefs\(allCards\.map\(c => c\.id\), JOB_SHEET_EXTRA_CARDS, 'safaeewala_job_sheet_cards'\)/.test(k) && /<CardsCustomizer title="Daily Job Sheet cards"/.test(k), true, 'show / hide / order, saved on this computer')

// R-SHEET-07
eq(JOB_SHEET_VIEWS.map(v => v.label), ['Table', 'Cards', 'Board', 'Calendar'], 'Table, Cards, Board, Calendar')
const djs = src('src/pages/DailyJobSheet.tsx')
eq(/<JobViews jobs=\{jobsForViews\}/.test(djs) && /'safaeewala_job_sheet_view'/.test(djs) && /_originalJobId \|\| r\.id/.test(djs), true, 'views use the filtered jobs, one card per job, view remembered')
eq(/route="\/bookings"|path="bookings"/.test(src('src/App.tsx')), true, 'Bookings screen stays until the owner says')
