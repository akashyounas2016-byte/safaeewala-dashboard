import { supabase } from '@/lib/supabase'

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

export function startLocationSharing(employeeId: string, onError: (msg: string) => void): () => void {
  if (!('geolocation' in navigator)) { onError('This phone or browser cannot share location.'); return () => {} }
  let last = 0
  const watchId = navigator.geolocation.watchPosition(
    pos => {
      const now = Date.now()
      if (now - last < MIN_INTERVAL_MS) return
      last = now
      void supabase.from('driver_locations').upsert({
        employee_id: employeeId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        sharing: true,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) onError(`Location not saved: ${error.message}`) })
    },
    err => onError(err.code === err.PERMISSION_DENIED ? 'Location permission was refused — allow it in the browser settings.' : `Location error: ${err.message}`),
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
  )
  return () => {
    navigator.geolocation.clearWatch(watchId)
    void supabase.from('driver_locations').update({ sharing: false, updated_at: new Date().toISOString() }).eq('employee_id', employeeId)
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
