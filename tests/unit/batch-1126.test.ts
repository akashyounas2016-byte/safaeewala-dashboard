// 2026-11-26: the Android app — bars, text size, field-login sync, update check, fixed signing key (R-APP-02)
import { readFileSync } from 'node:fs'
import { latestFromReleases } from '@/lib/appUpdate'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

eq(/isNativePlatform\?\.\(\)\) \{\r?\n\s*document\.querySelector\('meta\[name="viewport"\]'\)\?\.setAttribute\('content', 'width=device-width, initial-scale=1\.0'\)/.test(src('src/main.tsx')), true, 'in the app the page stays clear of the status / navigation bar')
eq(/SystemBars: \{ insetsHandling: 'css' \}/.test(src('capacitor.config.ts')), true, 'Capacitor keeps the WebView inside the bars')
eq(/setTextZoom\(100\)/.test(src('android/app/src/main/java/com/safaeewala/duties/MainActivity.java')), true, 'the phone font size does not blow up the screens')

const cs = src('src/lib/cloudState.ts')
eq(/if \(fieldLogin && !FIELD_WRITABLE\.has\(key\)\) \{ setKeyMeta\(key, \{ dirty: false \}\); return \}/.test(cs) && /FIELD_WRITABLE = new Set\(\['safaeewala_driver_plans'\]\)/.test(cs), true, 'a cleaner / driver login uploads only the driver plan (no stuck "changes not saved")')
eq(/setCloudFieldLogin\(!!maybeField\)/.test(src('src/components/layout/Sidebar.tsx')), true, 'the sidebar tells the sync who is signed in')

eq(latestFromReleases([{ tag_name: 'v1.2' }, { tag_name: 'android-test-2', assets: [{ name: 'a.apk', browser_download_url: 'u2' }] }, { tag_name: 'android-test-5', assets: [{ name: 'b.apk', browser_download_url: 'u5' }] }, { tag_name: 'android-test-9', assets: [] }]),
  { build: 5, url: 'u5' }, 'the newest test build with an APK')
eq(/New app version \(build \{appUpdate\.build\}\)/.test(src('src/pages/MyDuties.tsx')), true, 'My Duties offers the update inside the app')
const gradle = src('android/app/build.gradle')
eq(/versionCode\(\(project\.findProperty\('appVersionCode'\)/.test(gradle) && /storeType 'pkcs12'/.test(gradle), true, 'build number from GitHub; fixed key when the secret is there')
const wf = src('.github/workflows/android-apk.yml')
eq(/secrets\.ANDROID_KEYSTORE_B64/.test(wf) && /-PappVersionCode=\$\{\{ github\.run_number \}\}/.test(wf), true, 'workflow passes the key and the build number')
