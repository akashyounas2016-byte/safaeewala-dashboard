// 2026-11-12: complaints on the cleaner's profile and Health Score (R-EMP-13, R-CMP-02); Roles & Access in
// categories with Excel / Import options (R-SEC-09); Excel menu, row heights, one tick (UX-146, UX-147);
// attendance popup on the Excel sheet (R-ATT-11); no Billing tab
import { readFileSync } from 'node:fs'
import { calcEmployeeHealth, COMPLAINT_PENALTY } from '@/lib/employeeHealth'
import { ALL_MODULE_KEYS, PERMISSION_CATEGORIES, normalizeRolePerms, moduleForPath, canAccessModule, DEFAULT_ROLE_PERMS } from '@/lib/permissions'
import { quickStatusOf } from '@/components/dailyJobSheet/QuickAttendanceModal'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import type { Employee } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// ── R-EMP-13: complaints lower the Health Score by severity ──
const emp = { id: 'e1', full_name: 'TEST Cleaner' } as Employee
const t = todayDubai()
const base = calcEmployeeHealth(emp, []).score
const c = (priority: 'low' | 'medium' | 'high', daysAgo: number, status = 'open') => ({ priority, status, job_date: addDays(t, -daysAgo), created_at: `${addDays(t, -daysAgo)}T08:00:00Z` })
const h = calcEmployeeHealth(emp, [], {}, [c('high', 3), c('medium', 10, 'resolved'), c('low', 200)])
eq([base - h.score, h.complaints], [COMPLAINT_PENALTY.high + COMPLAINT_PENALTY.medium, { count: 2, deduction: 23, open: 1 }], 'high −15, medium −8; resolved still counts; older than 90 days does not')
eq(calcEmployeeHealth(emp, [], {}, Array.from({ length: 6 }, () => c('high', 1))).complaints.deduction, 40, 'at most −40')
eq(h.components.find(x => x.label === 'Complaints')?.score, -23, 'shown as its own line on the profile')
const profile = src('src/pages/EmployeeProfile.tsx')
eq([/<CleanerComplaintsCard/.test(profile), /calcEmployeeHealth\(emp, empJobs, attendanceMarks, empComplaints\)/.test(profile)], [true, true], 'the profile lists the complaints and scores with them')
const cmp = src('src/pages/Complaints.tsx')
eq([/entity: 'complaint'/.test(cmp), /Track record/.test(cmp), /params\.get\('open'\)/.test(cmp), /params\.get\('cleaner'\)/.test(cmp)], [true, true, true, true],
  'every step of a complaint is logged and shown as its track record; links open one complaint / one cleaner')

// ── R-SEC-09: Roles & Access in categories ──
const inCats = PERMISSION_CATEGORIES.flatMap(cat => cat.items.map(i => i.key))
eq([[...inCats].sort().join('|') === [...ALL_MODULE_KEYS].sort().join('|'), new Set(inCats).size === inCats.length], [true, true], 'every permission is in exactly one category')
eq(PERMISSION_CATEGORIES.find(x => x.title === 'Daily Job Sheet')?.items.map(i => i.key), ['Daily Job Sheet', 'Excel Job Sheet', 'Job Sheet Import & Delete', 'My Duties', 'Drivers'], 'Daily Job Sheet has its own category with its options')
eq(moduleForPath('/daily-job-sheet/spreadsheet'), 'Excel Job Sheet', 'the Excel sheet has its own permission')
const old = normalizeRolePerms({ employee: ['Overview', 'Daily Job Sheet'], cleaner: ['My Duties'] }) // saved before the split
eq([old.employee.includes('Excel Job Sheet'), old.employee.includes('Job Sheet Import & Delete'), old.cleaner.includes('Excel Job Sheet')], [true, true, false], 'a role that had the Daily Job Sheet keeps Excel / Import until the admin changes it')
const saved = normalizeRolePerms({ employee: ['Daily Job Sheet'], _modules: ALL_MODULE_KEYS })
eq([canAccessModule('employee', saved, 'Excel Job Sheet'), canAccessModule('admin', saved, 'Excel Job Sheet'), DEFAULT_ROLE_PERMS.supervisor.includes('Job Sheet Import & Delete')], [false, true, false], 'switched off = blocked; admin always allowed')
const djs = src('src/pages/DailyJobSheet.tsx')
eq([/useModuleAccess\('Excel Job Sheet'\)/.test(djs), /\{canBulk && <button/.test(djs), /\{canExcel && <button/.test(djs)], [true, true, true], 'the buttons follow the options')
const settings = src('src/pages/Settings.tsx')
eq([/id: 'billing'/.test(settings), /activeTab === 'billing'/.test(settings)], [false, false], 'no Billing tab')

// ── UX-146 / UX-147: Excel sheet ──
const sheet = src('src/pages/JobSheetSpreadsheet.tsx')
eq([(sheet.match(/<span>Delete Block \(/g) || []).length, /rowHeightPx: 24/.test(sheet), /rowHeightPx: 56/.test(sheet)], [1, true, false], 'one Delete Block; 24 px added, 56 px removed')
const delRow = sheet.indexOf('<span>Delete Row #'), delBlock = sheet.indexOf('<span>Delete Block ('), copy = sheet.indexOf('<span>Copy Row #')
eq([copy < delRow, delRow < delBlock], [true, true], 'Copy first; at the bottom Delete Row, then Delete Block')
eq([/toastMessage\.replace\(/.test(sheet), /success: \(message: string\) => toast\.success\(message\.replace/.test(src('src/lib/notify.ts'))], [true, true], 'one tick in the save toast')
const strip = (m: string) => m.replace(/^\s*[✓✔✅]️?\s*/u, '')
eq([strip('✓ Saved 4 changes'), strip('✅ Done'), strip('Saved')], ['Saved 4 changes', 'Done', 'Saved'], 'the "✓" in the text is dropped (the icon stays)')

// ── R-ATT-11: attendance popup ──
eq([quickStatusOf(undefined, true), quickStatusOf(undefined, false), quickStatusOf({ status: 'absent', updatedAt: '' }, true), quickStatusOf({ status: 'on_leave', updatedAt: '' }, false)],
  ['present', 'available', 'absent', 'on_leave'], 'a job = Present, no job = Available (never absent unless marked), a mark wins')
eq([/<QuickAttendanceModal/.test(sheet), /setShowQuickAttendance\(true\)/.test(sheet), /navigate\(`\/attendance\?date=\$\{effectiveTargetDate\}`\)/.test(sheet)], [true, true, true], 'the button opens the popup; View details opens the Attendance sheet')
