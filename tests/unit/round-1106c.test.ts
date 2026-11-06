// Round 2026-11-06 (c): AI alerts link to the record, Client Profile menu + Service History layout, Employees 5 a row
// (R-ALERT-03, UX-108, UX-109)
import { readFileSync } from 'node:fs'
import { aiIssueLinks } from '@/lib/alerts'
import { mergeLayout } from '@/components/ui/LayoutCustomizer'
import type { DetectedIssue } from '@/lib/crmAIBot'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// R-ALERT-03
const dup = { entityType: 'booking', entityId: 'b1', bookingId: 'b1' } as DetectedIssue
eq(aiIssueLinks(dup, [{ id: 'j9', booking_id: 'b1', date: '2026-11-06' }]).map(l => l.url), ['/bookings?booking=b1&edit=1', '/daily-job-sheet?date=2026-11-06&job=j9'], 'duplicate booking → edit the booking and open its job')
eq(aiIssueLinks(dup, []).length, 1, 'no job row → booking only')
eq(aiIssueLinks({ entityType: 'client', entityId: 'c1' } as DetectedIssue)[0].url, '/clients/c1', 'client finding → client profile')
eq(/a\.links \|\| \[\]\)\.map/.test(src('src/pages/Alerts.tsx')), true, 'links shown on the alert')
eq(/searchParams\.get\('edit'\) === '1'\) \{ setEditingBookingForModal\(hit\); setShowModal\(true\) \}/.test(src('src/pages/Bookings.tsx')), true, 'Bookings opens ?edit=1 in the edit form')
eq(/const linkedJobId = searchParams\.get\('job'\)/.test(src('src/pages/DailyJobSheet.tsx')), true, 'Daily Job Sheet opens ?job=<id>')

// UX-108
const items = [{ id: 'a', label: 'A', locked: true }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
eq(mergeLayout(items, { order: ['c', 'x', 'a'], hidden: ['a', 'c', 'x'] }), { order: ['c', 'a', 'b'], hidden: ['c'] }, 'saved order kept, new items appended, unknown ids and locked items ignored')
const cp = src('src/pages/ClientProfile.tsx')
eq(/label: 'Received' \}/.test(cp) && /label: 'Charges' \}/.test(cp) && /label: 'OT' \}/.test(cp) && !/Total Received|Total Charges|Total OT/.test(cp.slice(cp.indexOf('UX-108: short'), cp.indexOf('Financial History & Ledger Tab'))), true, 'short labels Charges / Received / OT')
eq(/<LayoutCustomizer sections=/.test(cp) && /historyCols\.visible\.map/.test(cp), true, 'cards and columns can be hidden / reordered')
eq(/Delete Profile/.test(cp) && /aria-label="More actions"/.test(cp), true, '⋮ menu with Delete Profile next to Edit Profile')

// UX-109
const em = src('src/pages/Employees.tsx')
eq((em.match(/<KpiCard /g) || []).length, 10, 'Employees: 10 cards in the Daily Job Sheet style')
eq((em.match(/xl:grid-cols-5 gap-3\.5/g) || []).length, 2, 'Employees: 5 a row')
