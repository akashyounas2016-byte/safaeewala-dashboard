// R-UI-01 English only on screen, UX-123 no "not saved" warning when leaving, UX-124 Attendance views
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [] })

// Roman Urdu words in strings shown on screen (code comments and the AI keyword matching are left out)
const URDU = /\b(aap|Aap|kiya|Kiya|hain|chahtay|karein|karen|nahi|mein|kay|jaye|saktay|pehlay|dobara|ghalat|darj|zaroor|tareeqa|Tareeqa|hota|hoti|jatay|liye|zariye|aur)\b/
const hits: string[] = []
for (const f of files('src')) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/\{\/\*.*?\*\/\}/g, '')
    if (/q\.includes\(|wantsBooking|COMPLAINT_WORDS/.test(code)) return
    if (URDU.test(code)) hits.push(`${f}:${i + 1}`)
  })
}
eq(hits, [], 'no Roman Urdu text on screen')
eq(/'Do you want to sign out of Safaeewala CRM\?'/.test(readFileSync('src/components/layout/Sidebar.tsx', 'utf8')), true, 'sign-out question in English')

// UX-123
const sheet = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
eq(/addEventListener\('beforeunload'/.test(sheet), false, 'no "leave site" warning on the Excel sheet')
eq(/saveOnLeaveRef/.test(sheet) && /await handleSaveAll\('auto'\)/.test(sheet), true, 'edits are saved on the way out instead')

// UX-124
const att = readFileSync('src/pages/Attendance.tsx', 'utf8')
eq(/aria-label="View"/.test(att) && /rosterView === 'table'/.test(att) && /setRosterHidden/.test(att) && /View all \$\{filteredRecords\.length\} cleaners/.test(att) && /const CARDS_FIRST = 6/.test(att), true, 'Attendance: Cards / Table, Hide / Show, first 6 cards then View all')
eq(/-mb-6"><ModuleTabs/.test(att), false, 'tabs keep their own spacing')
