// R-DOC-02 PDFs + storage first, UX-121 Bookings dates, UX-122 password, R-DUTY-02 My Duties ↔ Bookings, UX-117 tabs
import { readFileSync } from 'node:fs'
import { bookingRange, BOOKING_DATE_PRESETS } from '@/pages/Bookings'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (f: string) => readFileSync(f, 'utf8')

// UX-121
eq(BOOKING_DATE_PRESETS.map(p => p.label).slice(0, 6), ['All Time', 'Today', 'Yesterday', 'Last 3 Days', 'Last 7 Days', 'Last 30 Days'], 'date options in the asked order')
eq(BOOKING_DATE_PRESETS.at(-1)?.id, 'custom', 'Custom Range last')
const c = { start: '', end: '' }
eq([bookingRange('today', '2026-11-09', c), bookingRange('yesterday', '2026-11-09', c), bookingRange('3days', '2026-11-09', c).start, bookingRange('7days', '2026-11-09', c).start, bookingRange('3months', '2026-11-09', c).start],
  [{ start: '2026-11-09', end: '2026-11-09', label: 'Today' }, { start: '2026-11-08', end: '2026-11-08', label: 'Yesterday' }, '2026-11-07', '2026-11-03', '2026-08-09'], 'ranges from the Dubai date')
eq(/useState<BookingDatePreset>\('today'\)/.test(src('src/pages/Bookings.tsx')), true, 'default Today')

// R-DOC-02
const dv = src('src/lib/docVersions.ts')
eq(/export async function readAndStore/.test(dv) && /uploadInlineDocs\(folder, docs\)/.test(dv), true, 'picked files go to Storage at once')
eq(['src/components/employees/EmployeeFormModal.tsx', 'src/pages/Agencies.tsx', 'src/components/agencies/AgencyDashboard.tsx'].every(f => /readAndStore\(/.test(src(f)) && !/readFiles\(/.test(src(f))), true, 'employee + agency popups and direct upload use it')
eq(/accept="image\/\*,application\/pdf"/.test(src('src/components/common/DocVersionsField.tsx')) && /'Upload image or PDF'/.test(src('src/components/common/DocVersionsField.tsx')), true, 'image or PDF can be picked')
eq(/No binary file preview/.test(src('src/components/agencies/AgencyDashboard.tsx')), false, 'old "No binary file preview" message replaced')

// UX-122
const um = src('src/components/settings/UserManagement.tsx')
eq(/password: '' \}\)\); setTypePassword\(false\)/.test(um) && /Generate New Password/.test(um), true, 'the key opens the window without making a password; Generate New Password is explicit')

// R-DUTY-02
const md = src('src/pages/MyDuties.tsx')
eq(/Start this job\?/.test(md) && /End this job\?/.test(md) && /officeDone/.test(md), true, 'Start / End job popups; office-completed shown as done')
const sql = src('supabase/migrations/2026-11-09_duty_booking_sync.sql')
eq(/update public\.bookings set status = 'in_progress'/.test(sql) && /update public\.bookings set status = 'completed'/.test(sql) && /security definer/.test(sql), true, 'trigger moves the booking to In progress / Completed')

// UX-117
eq(/<ModuleTabs \/>/.test(src('src/components/layout/PageHero.tsx')), true, 'tabs under the header on every merged screen')
