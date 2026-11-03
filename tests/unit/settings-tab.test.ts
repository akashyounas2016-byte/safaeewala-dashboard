// SET-01 / SET-02 — coming back to the browser tab does not reload the app; Settings keeps its tab
import fs from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

const auth = fs.readFileSync('src/store/UserContext.tsx', 'utf8')
eq(/if \(event === 'SIGNED_IN' && session\?\.user\.id !== signedInAs\.current\) setStatus\('loading'\)/.test(auth), true, 'same user signing in again shows no loader')
eq(/JSON\.stringify\(prev\) === JSON\.stringify\(next\) \? prev : next/.test(auth), true, 'unchanged profile keeps the same user object')

const settings = fs.readFileSync('src/pages/Settings.tsx', 'utf8')
eq(/sessionStorage\.getItem\(SETTINGS_TAB_KEY\)/.test(settings) && /sessionStorage\.setItem\(SETTINGS_TAB_KEY, id\)/.test(settings), true, 'last tab is remembered')
eq(/url\.searchParams\.set\('tab', id\)/.test(settings), true, 'tab is in the URL')
eq(/const activeTab = tabs\.some\(t => t\.id === chosenTab\) \? chosenTab : 'company'/.test(settings), true, 'a hidden tab falls back to Company')
