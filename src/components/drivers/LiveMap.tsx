import { useEffect, useRef, useState } from 'react'
import { Plus, Minus, Crosshair } from 'lucide-react'

/**
 * R-DRV-03 / UX-82: one map with every driver's pin — OpenStreetMap tiles, no API key, no library.
 * Zooms to fit all pins; + / − and "fit" buttons; a pin click selects the driver.
 */
export interface MapPin { id: string; lat: number; lng: number; label: string; live: boolean }

const TILE = 256
const project = (lat: number, lng: number, z: number) => {
  const size = TILE * 2 ** z
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size }
}

/** Highest zoom that shows every pin inside the box (with a margin) */
export function fitZoom(pins: { lat: number; lng: number }[], width: number, height: number): number {
  if (pins.length <= 1) return 14
  for (let z = 16; z >= 3; z--) {
    const pts = pins.map(p => project(p.lat, p.lng, z))
    const w = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x))
    const h = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y))
    if (w <= width - 80 && h <= height - 80) return z
  }
  return 3
}

export function LiveMap({ pins, selected, onSelect, height = 420 }: { pins: MapPin[]; selected?: string | null; onSelect?: (id: string) => void; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [zoomShift, setZoomShift] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width) || 800))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Dubai when nobody shares a position
  const shown = pins.length > 0 ? pins : [{ id: '', lat: 25.2048, lng: 55.2708, label: '', live: false }]
  const z = Math.min(18, Math.max(3, fitZoom(shown, width, height) + zoomShift))
  const pts = shown.map(p => project(p.lat, p.lng, z))
  const cx = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2
  const cy = (Math.min(...pts.map(p => p.y)) + Math.max(...pts.map(p => p.y))) / 2
  const left = cx - width / 2, top = cy - height / 2
  const n = 2 ** z
  const tiles: { x: number; y: number; key: string }[] = []
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
    for (let ty = Math.max(0, Math.floor(top / TILE)); ty <= Math.min(n - 1, Math.floor((top + height) / TILE)); ty++) {
      tiles.push({ x: tx, y: ty, key: `${z}/${tx}/${ty}` })
    }
  }

  return (
    <div ref={boxRef} className="relative w-full overflow-hidden bg-slate-100 select-none" style={{ height }}>
      {tiles.map(t => (
        <img key={t.key} alt="" draggable={false} loading="lazy"
          src={`https://tile.openstreetmap.org/${z}/${((t.x % n) + n) % n}/${t.y}.png`}
          style={{ position: 'absolute', left: t.x * TILE - left, top: t.y * TILE - top, width: TILE, height: TILE }} />
      ))}
      {pins.map((p, i) => (
        <button key={p.id} type="button" onClick={() => onSelect?.(p.id)} title={p.label}
          style={{ position: 'absolute', left: pts[i].x - left, top: pts[i].y - top, transform: 'translate(-50%, -100%)' }}
          className="flex flex-col items-center cursor-pointer z-10">
          <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap shadow ${selected === p.id ? 'bg-emerald-700 text-white' : 'bg-white text-slate-800'}`}>{p.label}</span>
          <span className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow ${p.live ? 'bg-emerald-500' : 'bg-amber-400'}`} />
        </button>
      ))}
      <div className="absolute right-2 top-2 flex flex-col gap-1 z-20">
        <button type="button" onClick={() => setZoomShift(s => s + 1)} className="w-8 h-8 rounded-lg bg-white shadow flex items-center justify-center cursor-pointer" title="Zoom in"><Plus size={15} /></button>
        <button type="button" onClick={() => setZoomShift(s => s - 1)} className="w-8 h-8 rounded-lg bg-white shadow flex items-center justify-center cursor-pointer" title="Zoom out"><Minus size={15} /></button>
        <button type="button" onClick={() => setZoomShift(0)} className="w-8 h-8 rounded-lg bg-white shadow flex items-center justify-center cursor-pointer" title="Fit all drivers"><Crosshair size={15} /></button>
      </div>
      <span className="absolute right-1 bottom-0.5 text-[9.5px] text-slate-600 bg-white/80 px-1 rounded z-20">© OpenStreetMap contributors</span>
      {pins.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="px-3 py-2 rounded-xl bg-white/90 text-[12px] text-slate-600 shadow">No driver is sharing a position yet.</span>
        </div>
      )}
    </div>
  )
}
