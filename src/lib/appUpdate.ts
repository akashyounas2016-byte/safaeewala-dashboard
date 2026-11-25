import { useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/driverLocation'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

/**
 * R-APP-02: the app shows the live website, so screens update by themselves. Only a change to the app itself
 * (background location, look of the bars …) needs a new APK. Inside the app this checks GitHub's latest test build
 * (at most every 6 hours) against the installed build number and offers "Update the app".
 */
const RELEASES = 'https://api.github.com/repos/akashyounas2016-byte/safaeewala-dashboard/releases?per_page=5'
const CACHE_KEY = 'safaeewala_app_latest'
const SIX_HOURS = 6 * 3600_000

export interface AppUpdate { build: number; url: string }

/** The newest "android-test-N" release with its APK */
export function latestFromReleases(list: { tag_name?: string; assets?: { name?: string; browser_download_url?: string }[] }[]): AppUpdate | null {
  let best: AppUpdate | null = null
  for (const r of list) {
    const m = /^android-test-(\d+)$/.exec(r.tag_name || '')
    const apk = r.assets?.find(a => /\.apk$/i.test(a.name || ''))
    if (!m || !apk?.browser_download_url) continue
    const build = Number(m[1])
    if (!best || build > best.build) best = { build, url: apk.browser_download_url }
  }
  return best
}

export function useAppUpdate(): AppUpdate | null {
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  useEffect(() => {
    if (!isNativeApp()) return
    let alive = true
    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        const installed = Number((await App.getInfo()).build) || 0
        const cached = safeLocalStorageGet<{ at: number; latest: AppUpdate | null } | null>(CACHE_KEY, null)
        let latest = cached && Date.now() - cached.at < SIX_HOURS ? cached.latest : null
        if (!cached || Date.now() - cached.at >= SIX_HOURS) {
          const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
          latest = r.ok ? latestFromReleases(await r.json()) : null
          safeLocalStorageSet(CACHE_KEY, { at: Date.now(), latest })
        }
        if (alive && latest && latest.build > installed) setUpdate(latest)
      } catch { /* no internet or an old app without the App plugin: nothing to show */ }
    })()
    return () => { alive = false }
  }, [])
  return update
}
