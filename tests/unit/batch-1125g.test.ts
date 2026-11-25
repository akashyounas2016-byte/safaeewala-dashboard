// 2026-11-25 (g): Android test app (R-APP-01); live map same-place layout, clear lines, badge icons (R-OPS-22)
import { readFileSync, existsSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// R-APP-01
const cap = src('capacitor.config.ts')
eq(/appId: 'com\.safaeewala\.duties'/.test(cap) && /url: 'https:\/\/crm\.safaeewala\.com\/my-duties'/.test(cap), true, 'the app opens the live My Duties (deploys reach it without a new APK)')
eq(/useLegacyBridge: true/.test(cap) && /CapacitorHttp: \{ enabled: true \}/.test(cap), true, 'background location keeps going after 5 min and requests are not throttled')
eq(existsSync('android/app/src/main/AndroidManifest.xml') && existsSync('app-shell/index.html'), true, 'Android project and the no-internet page are in the repo')
const wf = src('.github/workflows/android-apk.yml')
eq(/assembleDebug/.test(wf) && /softprops\/action-gh-release/.test(wf) && /workflow_dispatch/.test(wf), true, 'APK built on GitHub and published as a pre-release')
const dl = src('src/lib/driverLocation.ts')
eq(/if \(isNativeApp\(\)\) return startNativeSharing/.test(dl) && /registerPlugin<BackgroundGeolocationPlugin>\('BackgroundGeolocation'\)/.test(dl) && /backgroundMessage:/.test(dl), true, 'in the app the position comes from the background service')
eq(/import\('@capacitor\/core'\)/.test(dl), true, 'the browser does not load the app code (loaded only inside the app)')
eq(/isNativeApp\(\) \|\| !nav\.wakeLock/.test(src('src/lib/useLiveSharing.ts')), true, 'no screen wake lock needed in the app')

// R-OPS-22
const map = src('src/components/overview/LiveOpsMap.tsx')
const m = /export function spreadAngles\(n: number\): number\[\] \{([\s\S]*?)\n\}/.exec(map)
const spreadAngles = new Function('n', m![1]) as (n: number) => number[]
eq([spreadAngles(2), spreadAngles(3), spreadAngles(4)], [[-135, -45], [-90, 180, 0], [-90, 180, 0, -135]], '2 upper-left / upper-right, 3 top / left / right, then all round')
eq(/color: '#ffffff', weight: 7/.test(map) && /weight: 3\.5, opacity: 1/.test(map) && !/dashArray/.test(map), true, 'solid lines with a white casing (were thin dashed)')
eq(/STATE_BADGE/.test(map) && /badgeSvg\(p\.state\)/.test(map) && !/stroke="\$\{ring\}"/.test(map), true, 'state shown as a badge icon on the pin (no yellow ring)')
const panel = src('src/components/overview/LiveOpsPanel.tsx')
eq(/<Clock3 size=\{9\}/.test(panel) && !/RING\[p\.state\]/.test(panel), true, 'legend and people cards use the same badge icons')
