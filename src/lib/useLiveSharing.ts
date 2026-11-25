import { useCallback, useEffect, useRef, useState } from 'react'
import { startLocationSharing, isNativeApp, type SharingHandle } from '@/lib/driverLocation'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

/** Minimal Screen Wake Lock types (not in every TS lib) */
interface WakeLockSentinelLike { release: () => Promise<void>; released?: boolean }
type WakeLockNav = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }

export const shareKey = (employeeId: string) => `safaeewala_share_location_${employeeId}`

/**
 * R-OPS-19: live location from the staff member's phone (My Duties), the best a website can do:
 *  - once they press Share, it stays on — opening My Duties again starts it by itself (remembered on the phone)
 *  - the screen is kept awake while sharing (Screen Wake Lock), so the phone does not lock and stop it
 *  - a position is sent at once, on every move (max every 20 s) and at least every minute when standing still
 *  - when the screen comes back on, the position is sent again straight away
 * With the page closed or the phone locked a website cannot send (Android / iPhone rule) — that needs the app.
 */
export function useLiveSharing(employeeId: string | undefined) {
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)
  const [awake, setAwake] = useState(false)
  const handle = useRef<SharingHandle | null>(null)
  const lock = useRef<WakeLockSentinelLike | null>(null)

  const keepAwake = useCallback(async () => {
    const nav = navigator as WakeLockNav
    // R-APP-01: the app shares from a background service — no need to keep the screen on
    if (isNativeApp() || !nav.wakeLock || document.visibilityState !== 'visible') return
    try {
      lock.current = await nav.wakeLock.request('screen')
      setAwake(true)
    } catch { setAwake(false) }
  }, [])
  const letSleep = useCallback(() => {
    void lock.current?.release().catch(() => {})
    lock.current = null
    setAwake(false)
  }, [])

  const start = useCallback(() => {
    if (!employeeId || handle.current) return
    setError(null)
    handle.current = startLocationSharing(employeeId, msg => setError(msg), at => { setLastSentAt(at); setError(null) })
    handle.current.ping()
    safeLocalStorageSet(shareKey(employeeId), true)
    setSharing(true)
    void keepAwake()
  }, [employeeId, keepAwake])

  const stop = useCallback(() => {
    handle.current?.stop()
    handle.current = null
    if (employeeId) safeLocalStorageSet(shareKey(employeeId), false)
    setSharing(false)
    letSleep()
  }, [employeeId, letSleep])

  // Turned on before on this phone → on again when My Duties opens.
  // R-APP-03: in the app it is always on — permission is asked when the app opens, no on / off button
  useEffect(() => {
    if (employeeId && (isNativeApp() || safeLocalStorageGet<boolean>(shareKey(employeeId), false))) start()
    return () => { handle.current?.stop(); handle.current = null; letSleep() }
  }, [employeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Screen back on: send now and keep the screen awake again (the lock is dropped when the page is hidden)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !handle.current) return
      handle.current.ping()
      void keepAwake()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [keepAwake])

  return { sharing, error, lastSentAt, awake, native: isNativeApp(), start, stop, toggle: () => (handle.current ? stop() : start()) }
}
