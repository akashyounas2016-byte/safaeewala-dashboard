import { supabase } from '@/lib/supabase'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'

/**
 * Live driver location (R-DRV-03). Only while the driver has pressed "Start sharing" on
 * My Duties and the page is open; one row per driver (latest position) in public.driver_locations.
 * The driver's phone asks for permission first; stopping clears nothing but marks the row as off.
 */
export interface DriverLocation {
  employee_id: string
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  sharing: boolean
  updated_at: string
}

const MIN_INTERVAL_MS = 20_000 // save at most every 20 s
const HEARTBEAT_MS = 60_000    // R-SEC-10 / R-OPS-14: standing still still counts as "live" (the map's live = < 5 min)

export interface SharingHandle {
  stop: () => void
  /** send the position now (e.g. when the phone screen comes back on) */
  ping: () => void
}

/** R-APP-01: true inside the Safaeewala Duties Android app (Capacitor), false in a browser */
export const isNativeApp = (): boolean => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

/**
 * R-APP-01: in the Android app the position comes from a foreground service (a notification shows while it runs),
 * so it keeps going with the screen off or the app in the background — what a website cannot do (R-OPS-19).
 */
function startNativeSharing(employeeId: string, onError: (msg: string) => void, onSent?: (at: number) => void): SharingHandle {
  let last = 0
  let lastFix: { lat: number; lng: number; accuracy: number | null; speed: number | null } | null = null
  let stopped = false
  const send = (force = false) => {
    if (!lastFix) return
    const now = Date.now()
    if (!force && now - last < MIN_INTERVAL_MS) return
    last = now
    void supabase.from('driver_locations').upsert({ employee_id: employeeId, ...lastFix, sharing: true, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) onError(`Location not saved: ${error.message}`); else onSent?.(now) })
  }
  const plugin = import('@capacitor/core').then(({ registerPlugin }) => registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation'))
  const watcher = plugin.then(bg => bg.addWatcher({
    backgroundTitle: 'Safaeewala Duties — on duty',
    backgroundMessage: 'Sharing your location with the office. Stop sharing in the app when your duty ends.',
    requestPermissions: true,
    stale: false,
    distanceFilter: 25,
  }, (loc, err) => {
    if (stopped) return
    if (err) {
      if (err.code === 'NOT_AUTHORIZED') {
        onError('Location permission is off — open Settings and allow location "All the time" for Safaeewala Duties.')
        void bg.openSettings()
      } else onError(`Location error: ${err.message}`)
      return
    }
    if (!loc) return
    lastFix = { lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy ?? null, speed: loc.speed ?? null }
    send()
  })).catch(e => { onError(`Background location could not start: ${e instanceof Error ? e.message : String(e)}`); return '' })
  // standing still sends no new fix: resend the last one every minute (the map's live = < 5 min)
  const beat = window.setInterval(() => { if (Date.now() - last >= HEARTBEAT_MS - 1000) send(true) }, HEARTBEAT_MS / 2)
  return {
    stop: () => {
      stopped = true
      window.clearInterval(beat)
      void Promise.all([plugin, watcher]).then(([bg, id]) => { if (id) void bg.removeWatcher({ id }) })
      void supabase.from('driver_locations').update({ sharing: false, updated_at: new Date().toISOString() }).eq('employee_id', employeeId)
    },
    ping: () => send(true),
  }
}

export function startLocationSharing(
  employeeId: string,
  onError: (msg: string) => void,
  onSent?: (at: number) => void,
): SharingHandle {
  if (isNativeApp()) return startNativeSharing(employeeId, onError, onSent)
  if (!('geolocation' in navigator)) { onError('This phone or browser cannot share location.'); return { stop: () => {}, ping: () => {} } }
  let last = 0
  let lastPos: GeolocationPosition | null = null
  const save = (pos: GeolocationPosition, force = false) => {
    lastPos = pos
    const now = Date.now()
    if (!force && now - last < MIN_INTERVAL_MS) return
    last = now
    void supabase.from('driver_locations').upsert({
      employee_id: employeeId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      speed: pos.coords.speed ?? null,
      sharing: true,
      updated_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) onError(`Location not saved: ${error.message}`); else onSent?.(now) })
  }
  const fail = (err: GeolocationPositionError) =>
    onError(err.code === err.PERMISSION_DENIED ? 'Location permission was refused — allow it in the browser settings.' : `Location error: ${err.message}`)
  const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 }
  const watchId = navigator.geolocation.watchPosition(pos => save(pos), fail, opts)
  // a phone that does not move fires no new position: ask again every minute (or resend the last one)
  const beat = window.setInterval(() => {
    if (Date.now() - last < HEARTBEAT_MS - 1000) return
    navigator.geolocation.getCurrentPosition(pos => save(pos, true), () => { if (lastPos) save(lastPos, true) }, opts)
  }, HEARTBEAT_MS / 2)
  return {
    stop: () => {
      navigator.geolocation.clearWatch(watchId)
      window.clearInterval(beat)
      void supabase.from('driver_locations').update({ sharing: false, updated_at: new Date().toISOString() }).eq('employee_id', employeeId)
    },
    ping: () => navigator.geolocation.getCurrentPosition(pos => save(pos, true), fail, opts),
  }
}

export async function fetchDriverLocations(): Promise<DriverLocation[]> {
  const { data, error } = await supabase.from('driver_locations').select('*')
  return error ? [] : ((data ?? []) as DriverLocation[])
}

/** "2 min ago" etc. */
export function ageLabel(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

/** OpenStreetMap embed around one point (no API key) */
export function osmEmbedUrl(lat: number, lng: number, zoomDelta = 0.01): string {
  const bbox = [lng - zoomDelta, lat - zoomDelta, lng + zoomDelta, lat + zoomDelta].map(n => n.toFixed(5)).join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`
}

/**
 * R-DRV-03: positions arrive live (Supabase Realtime) while the office has the map open; the 30-second
 * reload stays as a fallback when Realtime is off for the table.
 */
export function subscribeDriverLocations(onRow: (row: DriverLocation) => void): () => void {
  const channel = supabase.channel('crm-driver-locations').on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, payload => {
    const row = payload.new as DriverLocation | undefined
    if (row?.employee_id) onRow(row)
  })
  channel.subscribe()
  return () => { void supabase.removeChannel(channel) }
}
