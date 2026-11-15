// 2026-11-16 (UX-155): Excel Job Sheet three-dot menu → Delete Today / Delete All, each behind a warning popup
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const page = readFileSync('src/pages/JobSheetSpreadsheet.tsx', 'utf8')
const modals = readFileSync('src/components/dailyJobSheet/DailyJobModals.tsx', 'utf8')

eq(/\{canBulk && \(\s*<div className="py-1">\s*<div[^>]*>Delete<\/div>/.test(page), true, 'Delete section only for the "Import & delete a whole day" role option')
eq(/'Delete Today' : 'Delete This Day'/.test(page), true, 'Delete Today (or This Day when another date is open)')
eq(/disabled=\{!isOneDayView/.test(page), true, 'day delete needs one open day (not a week / month range)')
eq(/onClick=\{\(\) => \{ setShowThreeDotMenu\(false\); setShowDeleteDay\(true\) \}\}/.test(page) && /onClick=\{\(\) => \{ setShowThreeDotMenu\(false\); setShowDeleteAll\(true\) \}\}/.test(page), true, 'menu items only open the warning popups')
eq(/<DeleteDayConfirmModal[\s\S]*onConfirm=\{\(\) => deleteOneDay\(effectiveTargetDate\)\}/.test(page) && /<DeleteAllConfirmModal[\s\S]*onConfirm=\{deleteEverything\}/.test(page), true, 'popups do the deleting')
eq(/CLOSED_DAYS_KEY, \{\}\)\[date\]\) \{\s*notify\.error/.test(page), true, 'a closed day cannot be deleted')
eq(/clearDailyData\(date\)/.test(page) && /await clearAllDailyData\(\)/.test(page), true, 'same delete as the Daily Job Sheet (restore point, copy download, booking rows kept)')
eq(/reloadAfterSaveRef\.current = true \/\/ the grid shows the empty day/.test(page), true, 'the grid reloads after deleting')

eq(/const confirmed = typed\.trim\(\)\.toUpperCase\(\) === 'DELETE'/.test(modals), true, 'Delete All needs DELETE typed')
eq(/disabled=\{isDeleting \|\| !confirmed\}/.test(modals) && /if \(!confirmed\) return/.test(modals), true, 'button stays off until then')
eq(/Before-delete copies/.test(modals), true, 'popup says where the copy is')
eq(/UX-155/.test(readFileSync('design.md', 'utf8')), true, 'design.md entry')
