// 2026-11-26 (h): app — no "changes not saved" for cleaner logins, no location line (R-APP-05)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')
const cs = src('src/lib/cloudState.ts')
eq(/let fieldLogin = \(\(\) => \{ try \{ return localStorage\.getItem\(FIELD_FLAG\) === '1' \}/.test(cs), true, 'the phone remembers it is a cleaner / driver login, so the first uploads after opening are held back')
eq(/\/app_state_field\/i\.test\(String\(err\)\)/.test(cs), true, 'the server saying "field login" also stops the upload, no error')
eq(/if \(unsynced === 0\) lastError = undefined/.test(cs), true, 'nothing waiting → no old error on the banner')
eq(/useEffect\(\(\) => \{ if \(me\) setCloudFieldLogin\(!!maybeField\) \}, \[me, maybeField\]\)/.test(src('src/components/layout/Sidebar.tsx')), true, 'decided only once the login is known')
const md = src('src/pages/MyDuties.tsx')
eq(/const appLocationLine = inApp && canShare && shareError \?/.test(md) && !/Location is on — the office sees you on the map/.test(md), true, 'no location line in the app (only when permission is refused)')
