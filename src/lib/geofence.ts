/**
 * R-APP-04: is the cleaner at the job's place? The place is learnt from earlier job steps with a position at the
 * same address (no client coordinates are stored). Soft check: the cleaner is asked to confirm, the office gets
 * an alert — a job is never blocked (GPS can be off by a few hundred metres indoors).
 */
export const GEOFENCE_M = 300

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const addressKey = (s?: string | null) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The usual position of a place: the median of earlier positions there (needs at least one) */
export function sitePosition(points: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  const ok = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (!ok.length) return null
  const med = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  return { lat: med(ok.map(p => p.lat)), lng: med(ok.map(p => p.lng)) }
}

export const distanceText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/** Steps with a position grouped by the job's address */
export function positionsByAddress(
  steps: { job_id: string; lat?: number | null; lng?: number | null }[],
  addressOfJob: (jobId: string) => string | undefined,
): Map<string, { lat: number; lng: number; jobId: string }[]> {
  const out = new Map<string, { lat: number; lng: number; jobId: string }[]>()
  for (const s of steps) {
    if (s.lat == null || s.lng == null) continue
    const k = addressKey(addressOfJob(s.job_id))
    if (!k) continue
    out.set(k, [...(out.get(k) || []), { lat: Number(s.lat), lng: Number(s.lng), jobId: s.job_id }])
  }
  return out
}
