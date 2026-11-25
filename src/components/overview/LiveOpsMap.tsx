import { useCallback, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LivePerson, LiveRole } from '@/lib/liveOps'
import { ageLabel } from '@/lib/driverLocation'

/**
 * R-OPS-14: interactive map (drag, scroll-zoom, + / −) of cleaners, drivers and CSR, each a pin in the role's colour with
 * the full name under it (R-OPS-21). Hover (or tap) → name, role, what they are doing, the place they are at, when sent.
 * OpenStreetMap tiles, no API key. Loaded only with the Overview map (lazy chunk).
 */
export const ROLE_COLOR: Record<LiveRole, string> = { cleaner: '#059669', driver: '#2563eb', technical: '#ea580c' }
// R-OPS-21: a map pin in the role's colour with the role's sign (sparkle = cleaner, van = driver, wrench = technical)
const ROLE_GLYPH: Record<LiveRole, string> = {
  cleaner: '<path d="M12 5l1.4 3.6L17 10l-3.6 1.4L12 15l-1.4-3.6L7 10l3.6-1.4z" fill="#fff"/><path d="M17.5 14.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#fff" opacity=".85"/>',
  driver: '<path d="M5 15v-4l2-3h8l3 3v4H5z" stroke="#fff" stroke-width="1.7" fill="none" stroke-linejoin="round"/><circle cx="8.5" cy="16" r="1.5" fill="#fff"/><circle cx="15" cy="16" r="1.5" fill="#fff"/>',
  technical: '<path d="M15.5 5.5a3.6 3.6 0 00-4.6 4.6l-5 5a1.3 1.3 0 001.9 1.9l5-5a3.6 3.6 0 004.6-4.6l-2.1 2.1-1.8-.3-.3-1.8z" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
}
const STATE_RING = { live: '#22c55e', stale: '#f59e0b', checkin: '#94a3b8' } as const
const STATE_WORD = { live: 'Live', stale: 'Last known', checkin: 'At last job step' } as const

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** R-OPS-21: pin + the person's full name under it (was a robot with initials) */
function botIcon(p: LivePerson): L.DivIcon {
  const c = ROLE_COLOR[p.role], ring = STATE_RING[p.state]
  const pulse = p.state === 'live' ? `<span style="position:absolute;left:50%;top:15px;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:9999px;border:2px solid ${ring};opacity:.55;animation:saf-ping 1.8s ease-out infinite"></span>` : ''
  const html = `
    <div style="position:relative;width:170px;height:66px;display:flex;flex-direction:column;align-items:center">
      ${pulse}
      <svg width="34" height="44" viewBox="0 0 34 44" style="filter:drop-shadow(0 3px 4px rgba(15,23,42,.35))">
        <path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.8 1.5 28 17 42.5 17 42.5S32.5 28 32.5 16.8C32.5 8.3 25.6 1.5 17 1.5z" fill="${c}" stroke="#fff" stroke-width="2"/>
        <circle cx="17" cy="16.5" r="10.5" fill="rgba(255,255,255,.16)" stroke="${ring}" stroke-width="2.4"/>
        <g transform="translate(5 4.5)">${ROLE_GLYPH[p.role]}</g>
      </svg>
      <span style="margin-top:1px;max-width:166px;overflow:hidden;text-overflow:ellipsis;padding:1px 7px;border-radius:7px;background:#fff;color:#0f172a;border:1px solid ${c};box-shadow:0 1px 3px rgba(15,23,42,.25);font:700 10.5px/15px system-ui;white-space:nowrap">${esc(p.name)}</span>
    </div>`
  return L.divIcon({ html, className: 'saf-bot', iconSize: [170, 66], iconAnchor: [85, 44], tooltipAnchor: [0, -44] })
}

/** R-OPS-21: the place name of a position — from the job step when known, else looked up once (OpenStreetMap, ~100 m) */
const placeCache = new Map<string, string>()
const placeKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`
async function lookupPlace(lat: number, lng: number): Promise<string> {
  const k = placeKey(lat, lng)
  const hit = placeCache.get(k)
  if (hit) return hit
  try {
    const [la, ln] = k.split(',')
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=en&lat=${la}&lon=${ln}`)
    const d = await r.json() as { address?: Record<string, string>; display_name?: string }
    const a = d.address || {}
    const name = [a.building || a.amenity || a.shop || a.office || a.road, a.neighbourhood || a.suburb || a.quarter || a.city_district, a.city || a.town].filter(Boolean).slice(0, 3).join(', ')
      || (d.display_name || '').split(',').slice(0, 3).join(',')
    placeCache.set(k, name || `${la}, ${ln}`)
  } catch { placeCache.set(k, `${lat.toFixed(4)}, ${lng.toFixed(4)}`) }
  return placeCache.get(k)!
}

function card(p: LivePerson, now: number): string {
  const place = p.place || placeCache.get(placeKey(p.lat, p.lng))
  return `<div style="min-width:220px;max-width:280px;font:12px/1.4 system-ui">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <b style="font-size:13px;color:#0f172a">${esc(p.name)}</b>
      <span style="padding:0 6px;border-radius:9999px;background:${ROLE_COLOR[p.role]};color:#fff;font-size:10px;font-weight:700">${esc(p.roleLabel)}</span>
    </div>
    <div style="color:#0f172a;font-weight:600">${esc(p.task)}</div>
    ${p.detail ? `<div style="color:#475569">${esc(p.detail)}</div>` : ''}
    <div style="margin-top:4px;padding:4px 6px;border-radius:8px;background:#f1f5f9;color:#0f172a">📍 <b>Now at:</b> ${place ? esc(place) : '<span style="color:#64748b">finding the place…</span>'}</div>
    <div style="margin-top:4px;color:${STATE_RING[p.state] === '#94a3b8' ? '#64748b' : STATE_RING[p.state]};font-weight:700">
      ● ${STATE_WORD[p.state]} · ${esc(ageLabel(p.updatedAt, now))}${p.speed && p.speed > 1 ? ` · ${Math.round(p.speed * 3.6)} km/h` : ''}
    </div>
  </div>`
}

export default function LiveOpsMap({ people, height = 560, now, focusId, onFocus, fitSignal = 0 }: {
  people: LivePerson[]; height?: number; now: number; focusId?: string | null; onFocus?: (id: string) => void; fitSignal?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const hubLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const fittedRef = useRef('')
  const peopleRef = useRef(new Map<string, LivePerson>())
  const nowRef = useRef(Date.now())

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    // R-OPS-20: draw markers on one canvas and keep tiles around the view, so the map comes up and pans faster
    const map = L.map(boxRef.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true, preferCanvas: true, fadeAnimation: false }).setView([25.2048, 55.2708], 11)
    // R-OPS-16: colourful base map by default; Streets and Satellite to switch (no API keys)
    // OpenStreetMap Humanitarian style: bright colours, no key (CARTO's tiles now ask for a key)
    const colorful = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc', keepBuffer: 4, updateWhenZooming: false, attribution: '© OpenStreetMap contributors, Humanitarian style by OpenStreetMap France' })
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' })
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' })
    colorful.addTo(map)
    L.control.layers({ Colorful: colorful, Streets: streets, Satellite: satellite }, undefined, { position: 'topright' }).addTo(map)
    L.control.scale({ imperial: false }).addTo(map)
    hubLayerRef.current = L.layerGroup().addTo(map) // R-OPS-21: centre points + lines under the pins
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(boxRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; markersRef.current.clear() }
  }, [])

  // Markers follow the list (moved, not recreated, so an open card stays open)
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    const seen = new Set<string>()
    peopleRef.current = new Map(people.map(p => [p.id, p]))
    nowRef.current = now
    people.forEach(p => {
      seen.add(p.id)
      let m = markersRef.current.get(p.id)
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon: botIcon(p), riseOnHover: true, title: p.name })
        m.bindTooltip(card(p, now), { direction: 'top', opacity: 1, className: 'saf-bot-tip' })
        m.on('click', () => { onFocus?.(p.id); m!.openTooltip() })
        // R-OPS-21: name the place on first hover when no job step names it
        const mk = m
        mk.on('tooltipopen', () => {
          const cur = peopleRef.current.get(p.id)
          if (!cur || cur.place || placeCache.has(placeKey(cur.lat, cur.lng))) return
          void lookupPlace(cur.lat, cur.lng).then(() => { const now2 = peopleRef.current.get(p.id); if (now2) mk.setTooltipContent(card(now2, nowRef.current)) })
        })
        m.addTo(layer)
        markersRef.current.set(p.id, m)
      } else {
        m.setLatLng([p.lat, p.lng]).setIcon(botIcon(p))
        m.setTooltipContent(card(p, now))
      }
    })
    markersRef.current.forEach((m, id) => { if (!seen.has(id)) { layer.removeLayer(m); markersRef.current.delete(id) } })
    spread()
    // Fit everyone once per set of people (not on every position update)
    const key = people.map(p => p.id).sort().join(',')
    if (key && key !== fittedRef.current) {
      fittedRef.current = key
      if (people.length === 1) map.setView([people[0].lat, people[0].lng], 14)
      else map.fitBounds(L.latLngBounds(people.map(p => [p.lat, p.lng] as [number, number])), { padding: [50, 50], maxZoom: 15 })
    }
  }, [people, now, onFocus]) // eslint-disable-line react-hooks/exhaustive-deps -- spread is stable (useCallback, no deps)

  // R-OPS-21: people at the same place (within ~40 m) get one centre point; their pins sit around it on a ring,
  // each joined to the centre by a line — nobody hides behind another. Redone on every zoom (the ring is in pixels).
  const spread = useCallback(() => {
    const map = mapRef.current, hubs = hubLayerRef.current
    if (!map || !hubs) return
    hubs.clearLayers()
    const groups = new Map<string, LivePerson[]>()
    peopleRef.current.forEach(p => {
      const k = `${(Math.round(p.lat / 0.0004) * 0.0004).toFixed(4)},${(Math.round(p.lng / 0.0004) * 0.0004).toFixed(4)}`
      groups.set(k, [...(groups.get(k) || []), p])
    })
    const zoom = map.getZoom()
    groups.forEach(list => {
      if (list.length === 1) { markersRef.current.get(list[0].id)?.setLatLng([list[0].lat, list[0].lng]); return }
      const lat = list.reduce((s, p) => s + p.lat, 0) / list.length, lng = list.reduce((s, p) => s + p.lng, 0) / list.length
      const centre = map.project([lat, lng], zoom)
      const radius = 46 + list.length * 7
      list.forEach((p, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / list.length
        const at = map.unproject(centre.add(L.point(Math.cos(a) * radius, Math.sin(a) * radius)), zoom)
        markersRef.current.get(p.id)?.setLatLng(at)
        L.polyline([[lat, lng], at], { color: ROLE_COLOR[p.role], weight: 2, opacity: 0.75, dashArray: '4 4', interactive: false }).addTo(hubs)
      })
      const names = list.map(p => esc(p.name)).join('<br>')
      L.marker([lat, lng], {
        icon: L.divIcon({ className: 'saf-bot', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="width:30px;height:30px;border-radius:9999px;background:#0f172a;color:#fff;border:3px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;font:800 12px system-ui">${list.length}</div>` }),
        zIndexOffset: -500,
      }).bindTooltip(`<div style="font:12px/1.4 system-ui"><b>${list.length} at the same place</b><br>${names}</div>`, { direction: 'top', className: 'saf-bot-tip' }).addTo(hubs)
    })
  }, [])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const redo = () => spread()
    map.on('zoomend', redo)
    return () => { map.off('zoomend', redo) }
  }, [spread])

  // "Fit all" button: show every bot again
  useEffect(() => {
    const map = mapRef.current
    if (!fitSignal || !map || !people.length) return
    if (people.length === 1) map.setView([people[0].lat, people[0].lng], 14)
    else map.fitBounds(L.latLngBounds(people.map(p => [p.lat, p.lng] as [number, number])), { padding: [50, 50], maxZoom: 15 })
  }, [fitSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = focusId ? markersRef.current.get(focusId) : undefined
    if (m && mapRef.current) { mapRef.current.setView(m.getLatLng(), Math.max(mapRef.current.getZoom(), 14)); m.openTooltip() }
  }, [focusId])

  return (
    <>
      <style>{'@keyframes saf-ping{0%{transform:scale(.85);opacity:.7}100%{transform:scale(1.5);opacity:0}}.saf-bot{background:none;border:none}.saf-bot-tip{border-radius:12px;padding:8px 10px;box-shadow:0 8px 24px rgba(15,23,42,.18);border:1px solid #e2e8f0}'}</style>
      <div ref={boxRef} className="w-full rounded-2xl overflow-hidden border border-[#E4E8EC] z-0" style={{ height }} />
    </>
  )
}
