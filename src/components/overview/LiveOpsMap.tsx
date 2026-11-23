import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LivePerson, LiveRole } from '@/lib/liveOps'
import { ageLabel } from '@/lib/driverLocation'

/**
 * R-OPS-14: interactive map (drag, scroll-zoom, + / −) of cleaners, drivers and CSR, each a small bot icon in the
 * role's colour. Hover (or tap) a bot → name, role, what they are doing now and when the position was sent.
 * OpenStreetMap tiles, no API key. Loaded only with the Overview map (lazy chunk).
 */
export const ROLE_COLOR: Record<LiveRole, string> = { cleaner: '#059669', driver: '#2563eb', csr: '#7c3aed' }
const ROLE_GLYPH: Record<LiveRole, string> = {
  // broom / van / headset, drawn as the bot's "badge"
  cleaner: '<path d="M14 3l-5 9M7 12h6l2 6H5z" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  driver: '<path d="M4 13V9l2-3h7l3 3v4H4z" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="7" cy="14.5" r="1.4" fill="#fff"/><circle cx="13.5" cy="14.5" r="1.4" fill="#fff"/>',
  csr: '<path d="M5 12V10a5 5 0 0110 0v2M5 11h2v4H5zM13 11h2v4h-2zM15 15c0 1.5-2 2.5-4 2.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
}
const STATE_RING = { live: '#22c55e', stale: '#f59e0b', checkin: '#94a3b8' } as const
const STATE_WORD = { live: 'Live', stale: 'Last known', checkin: 'At last job step' } as const

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')

function botIcon(p: LivePerson): L.DivIcon {
  const c = ROLE_COLOR[p.role], ring = STATE_RING[p.state]
  const pulse = p.state === 'live' ? `<span style="position:absolute;inset:-5px;border-radius:9999px;border:2px solid ${ring};opacity:.55;animation:saf-ping 1.8s ease-out infinite"></span>` : ''
  const html = `
    <div style="position:relative;width:40px;height:52px;display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:40px;height:40px">
        ${pulse}
        <svg width="40" height="40" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 3px rgba(15,23,42,.35))">
          <circle cx="20" cy="20" r="18" fill="#fff" stroke="${ring}" stroke-width="3"/>
          <rect x="9" y="11" width="22" height="17" rx="6" fill="${c}"/>
          <line x1="20" y1="11" x2="20" y2="6.5" stroke="${c}" stroke-width="2"/><circle cx="20" cy="5.5" r="2" fill="${c}"/>
          <circle cx="15" cy="18" r="2.2" fill="#fff"/><circle cx="25" cy="18" r="2.2" fill="#fff"/>
          <rect x="15" y="23" width="10" height="1.8" rx=".9" fill="#fff"/>
          <g transform="translate(26 25) scale(.55)"><circle cx="10" cy="10" r="10" fill="${c}" stroke="#fff" stroke-width="2"/>${ROLE_GLYPH[p.role]}</g>
        </svg>
      </div>
      <span style="margin-top:1px;padding:0 5px;border-radius:6px;background:#0f172a;color:#fff;font:700 9.5px/14px system-ui;white-space:nowrap">${esc(initials(p.name))}</span>
    </div>`
  return L.divIcon({ html, className: 'saf-bot', iconSize: [40, 52], iconAnchor: [20, 46], tooltipAnchor: [0, -44] })
}

function card(p: LivePerson, now: number): string {
  return `<div style="min-width:200px;max-width:260px;font:12px/1.4 system-ui">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <b style="font-size:13px;color:#0f172a">${esc(p.name)}</b>
      <span style="padding:0 6px;border-radius:9999px;background:${ROLE_COLOR[p.role]};color:#fff;font-size:10px;font-weight:700">${esc(p.roleLabel)}</span>
    </div>
    <div style="color:#0f172a;font-weight:600">${esc(p.task)}</div>
    ${p.detail ? `<div style="color:#475569">${esc(p.detail)}</div>` : ''}
    <div style="margin-top:4px;color:${STATE_RING[p.state] === '#94a3b8' ? '#64748b' : STATE_RING[p.state]};font-weight:700">
      ● ${STATE_WORD[p.state]} · ${esc(ageLabel(p.updatedAt, now))}${p.speed && p.speed > 1 ? ` · ${Math.round(p.speed * 3.6)} km/h` : ''}
    </div>
  </div>`
}

export default function LiveOpsMap({ people, height = 440, now, focusId, onFocus }: {
  people: LivePerson[]; height?: number; now: number; focusId?: string | null; onFocus?: (id: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const fittedRef = useRef('')

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return
    const map = L.map(boxRef.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true }).setView([25.2048, 55.2708], 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map)
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
    people.forEach(p => {
      seen.add(p.id)
      let m = markersRef.current.get(p.id)
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon: botIcon(p), riseOnHover: true, title: p.name })
        m.bindTooltip(card(p, now), { direction: 'top', opacity: 1, className: 'saf-bot-tip' })
        m.on('click', () => { onFocus?.(p.id); m!.openTooltip() })
        m.addTo(layer)
        markersRef.current.set(p.id, m)
      } else {
        m.setLatLng([p.lat, p.lng]).setIcon(botIcon(p))
        m.setTooltipContent(card(p, now))
      }
    })
    markersRef.current.forEach((m, id) => { if (!seen.has(id)) { layer.removeLayer(m); markersRef.current.delete(id) } })
    // Fit everyone once per set of people (not on every position update)
    const key = people.map(p => p.id).sort().join(',')
    if (key && key !== fittedRef.current) {
      fittedRef.current = key
      if (people.length === 1) map.setView([people[0].lat, people[0].lng], 14)
      else map.fitBounds(L.latLngBounds(people.map(p => [p.lat, p.lng] as [number, number])), { padding: [50, 50], maxZoom: 15 })
    }
  }, [people, now, onFocus])

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
