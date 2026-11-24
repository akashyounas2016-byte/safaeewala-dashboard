// 2026-11-24 (c): field logins see only their own data (R-SEC-10); live location from the phone (R-OPS-19)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// R-SEC-10 — database
const sql = src('supabase/migrations/2026-11-24_field_login_more_tables.sql')
for (const t of ['audit_log', 'job_checkins', 'driver_locations', 'attendance_marks', 'employees'])
  eq(new RegExp(`create policy ${t}_field_read on public\\.${t} as restrictive for select`).test(sql), true, `${t}: field logins read only their own rows`)
eq(/id = public\.my_employee_id\(\)\);/.test(sql) && !/or role = ''driver''/.test(sql), true, 'employees: own record only (no drivers\' full records)')
eq(/function public\.field_staff_directory\(\)[\s\S]*e\.role = 'driver'/.test(sql) && /returns table \(id text, full_name text, short_name text, role text, phone text\)/.test(sql), true, 'drivers\' name and phone through field_staff_directory()')
eq(/not public\.is_field_login\(\)/.test(sql), true, 'office logins are not affected')

// R-SEC-10 — VPS API
const srv = src('webhookServer.cjs')
eq(/FIELD_API_ALLOWED = new Set\(\['\/api\/health', '\/api\/logs\/errors', '\/api\/logs\/csp'\]\)/.test(srv), true, 'field logins may call health and logs only')
eq(/user && user\.field && !FIELD_API_ALLOWED\.has\(pathname\)\) return \{ ok: false, status: 403/.test(srv), true, 'leads, agencies, backups refused (403) for a field login')
eq(/field = !!\(emp && emp\[0\] && emp\[0\]\.role !== 'supervisor'\)/.test(srv), true, 'same field rule as the app (linked, not a supervisor)')

// R-SEC-10 — app
const side = src('src/components/layout/Sidebar.tsx')
eq(/useFluentFormsUnreadCount\(!!me && !maybeField\)/.test(side) && /staffResolving \|\| isFieldLogin/.test(side), true, 'no lead polling for a field login, also while the login type is still unknown')
eq(/export function useFluentFormsUnreadCount\(enabled = true\)/.test(src('src/lib/fluentFormsSync.ts')), true, 'lead counter can be switched off')
const md = src('src/pages/MyDuties.tsx')
eq(/supabase\.rpc\('field_staff_directory'\)/.test(md) && /cleanerDuties\(dailyJobs, person, date, plan, staffForDuties\)/.test(md), true, 'My Duties shows the driver from the directory')

// R-OPS-19 — live location
const ls = src('src/lib/useLiveSharing.ts')
eq([/wakeLock\.request\('screen'\)/.test(ls), /safeLocalStorageGet<boolean>\(shareKey\(employeeId\), false\)\) start\(\)/.test(ls), /visibilitychange/.test(ls)], [true, true, true], 'screen kept awake, starts again by itself, sends when the screen comes back')
const dl = src('src/lib/driverLocation.ts')
eq(/HEARTBEAT_MS = 60_000/.test(dl) && /getCurrentPosition\(pos => save\(pos, true\)/.test(dl), true, 'standing still still sends every minute')
eq(/useLiveSharing\(linked\?\.id\)/.test(md) && /last sent/.test(md), true, 'My Duties uses it and shows when the position was last sent')
