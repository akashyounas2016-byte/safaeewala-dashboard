import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radar, Sparkles, Truck, Wrench, Users, Maximize2, Minimize2, Crosshair, GripHorizontal, MapPinOff } from 'lucide-react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { useData } from '@/store/DataContext'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { fetchDriverLocations, subscribeDriverLocations, ageLabel, type DriverLocation } from '@/lib/driverLocation'
import { useJobCheckinsFor } from '@/lib/jobCheckins'
import { useDayPlan } from '@/lib/driverPlans'
import { buildRouteSites } from '@/lib/driverRoutes'
import { buildLivePeople, unplacedOnDuty, type LiveRole } from '@/lib/liveOps'
import { dubaiMinutes } from '@/lib/overviewStats'
import { useFolded, FoldButton } from './Foldable'

// R-OPS-20: the map code (Leaflet) starts downloading as soon as the Overview opens, not when the panel renders
const loadMap = () => import('./LiveOpsMap')
const LiveOpsMap = lazy(loadMap)
if (typeof window !== 'undefined') void loadMap().catch(() => {})
/** R-OPS-20: map height, dragged by the handle under it (remembered on this computer) */
const MAP_H_KEY = 'safaeewala_overview_map_h'
const MAP_H_MIN = 300, MAP_H_MAX = 1000, MAP_H_DEFAULT = 520
const COLOR: Record<LiveRole, string> = { cleaner: '#059669', driver: '#2563eb', technical: '#ea580c' } // R-OPS-21: Technical instead of CSR
const RING = { live: '#22c55e', stale: '#f59e0b', checkin: '#94a3b8' } as const

/**
 * R-OPS-14 / R-OPS-16: Overview → Live map, full width. Cleaners, drivers and CSR who share their position
 * (My Duties), or whose last job step today had one. Colourful / Streets / Satellite map, full screen,
 * fit-all, role filters with counts, the people as cards under the map. Live through Supabase Realtime;
 * reload every 30 s as a fallback.
 */
export function LiveOpsPanel() {
  const { employees, dailyJobs } = useData()
  const today = todayDubai()
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [role, setRole] = useState<'all' | LiveRole>('all')
  const [focus, setFocus] = useState<string | null>(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [full, setFull] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [folded, toggleFold] = useFolded('liveMap') // R-OPS-17
  const [mapH, setMapH] = useState(() => Math.min(MAP_H_MAX, Math.max(MAP_H_MIN, Number(safeLocalStorageGet<number>(MAP_H_KEY, MAP_H_DEFAULT)) || MAP_H_DEFAULT)))
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const y0 = e.clientY, h0 = mapH
    let last = h0
    const move = (ev: PointerEvent) => { last = Math.min(MAP_H_MAX, Math.max(MAP_H_MIN, Math.round(h0 + ev.clientY - y0))); setMapH(last) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); safeLocalStorageSet(MAP_H_KEY, last) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const nudge = (d: number) => setMapH(h => { const n = Math.min(MAP_H_MAX, Math.max(MAP_H_MIN, h + d)); safeLocalStorageSet(MAP_H_KEY, n); return n })
  // R-OPS-21: steps of yesterday's and today's jobs, live (a job of yesterday can be started today)
  const checkinRows = useJobCheckinsFor([addDays(today, -1), today])
  const [plan] = useDayPlan(today)

  useEffect(() => {
    let alive = true
    const load = () => fetchDriverLocations().then(l => { if (alive) { setLocations(l); setNow(Date.now()) } })
    void load()
    const t = window.setInterval(load, 30_000)
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    const stop = subscribeDriverLocations(row => {
      if (!alive) return
      setLocations(prev => [row, ...prev.filter(l => l.employee_id !== row.employee_id)])
      setNow(Date.now())
    })
    return () => { alive = false; window.clearInterval(t); window.clearInterval(tick); stop() }
  }, [])

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === boxRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void boxRef.current?.requestFullscreen?.()
  }

  const sites = useMemo(() => buildRouteSites(dailyJobs, today), [dailyJobs, today])
  const people = useMemo(() => buildLivePeople({
    employees, locations, checkins: Object.values(checkinRows), dailyJobs, date: today, nowMs: now, nowMin: dubaiMinutes(new Date(now)), plan, sites,
  }), [employees, locations, checkinRows, dailyJobs, today, now, plan, sites])
  // R-OPS-21: on a job now but not on the map — listed, so the map matches the live jobs
  const unplaced = useMemo(() => unplacedOnDuty({ employees, dailyJobs, checkins: Object.values(checkinRows), date: today, nowMs: now, nowMin: dubaiMinutes(new Date(now)), placed: new Set(people.map(p => p.id)) }),
    [employees, dailyJobs, checkinRows, today, now, people])
  const onJobNow = people.filter(p => p.role === 'cleaner' && p.task.startsWith('Working at')).length + unplaced.length
  const shown = role === 'all' ? people : people.filter(p => p.role === role)
  const count = (r: LiveRole) => people.filter(p => p.role === r).length
  const live = people.filter(p => p.state === 'live').length
  const onFocus = useCallback((id: string) => setFocus(id), [])

  const chips: { id: 'all' | LiveRole; label: string; icon: typeof Users; n: number; color: string }[] = [
    { id: 'all', label: 'All', icon: Users, n: people.length, color: '#0f172a' },
    { id: 'cleaner', label: 'Cleaners', icon: Sparkles, n: count('cleaner'), color: COLOR.cleaner },
    { id: 'driver', label: 'Drivers', icon: Truck, n: count('driver'), color: COLOR.driver },
    { id: 'technical', label: 'Technical', icon: Wrench, n: count('technical'), color: COLOR.technical },
  ]

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* R-OPS-17: header in the CRM's forest green (same as the page headers); each role chip in its map colour */}
      <div className="px-5 py-4 bg-[radial-gradient(120%_160%_at_0%_0%,#14532d_0%,#0F1F19_55%,#0b1712_100%)] text-white flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-emerald-400/15 border border-emerald-300/25 flex items-center justify-center"><Radar size={20} className="text-emerald-300" /></span>
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">Live Map
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold bg-emerald-400/15 text-emerald-200 border border-emerald-300/25 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> {live} live now
              </span>
            </h3>
            <p className="text-[12.5px] text-white/70">Cleaners, drivers and technicians on duty — hover a pin for the person, their task and where they are</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!folded && chips.map(c => (
            <button key={c.id} type="button" onClick={() => setRole(c.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer transition-colors border ${role === c.id ? 'bg-white shadow border-white' : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/90'}`}
              style={role === c.id ? { color: c.color } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: c.id === 'all' ? '#e2e8f0' : c.color }} />
              <c.icon size={13} /> {c.label}
              <span className="min-w-[18px] text-center px-1 rounded-md text-[11px]" style={role === c.id ? { background: c.color, color: '#fff' } : { background: 'rgba(255,255,255,.14)' }}>{c.n}</span>
            </button>
          ))}
          <FoldButton folded={folded} onToggle={toggleFold} light />
        </div>
      </div>

      {!folded && <div className="p-4 sm:p-5 space-y-4 bg-gradient-to-b from-emerald-50/60 to-white">
        {/* Map — full width */}
        <div ref={boxRef} className={`relative ${full ? 'bg-white p-3' : ''}`} style={full ? { height: '100vh' } : undefined}>
          <Suspense fallback={<div className="w-full rounded-2xl bg-gradient-to-br from-emerald-50 to-slate-100 animate-pulse flex items-center justify-center text-[12px] font-semibold text-emerald-800/70" style={{ height: mapH }}>Loading map…</div>}>
            <LiveOpsMap people={shown} now={now} focusId={focus} onFocus={onFocus} fitSignal={fitSignal} height={full ? window.innerHeight - 24 : mapH} />
          </Suspense>
          <div className="absolute left-14 top-3 z-[500] flex gap-1.5">
            <button type="button" onClick={() => setFitSignal(n => n + 1)} title="Show everyone"
              className="h-8 px-2.5 rounded-lg bg-white/95 shadow border border-slate-200 text-[11.5px] font-bold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer"><Crosshair size={13} /> Fit all</button>
            <button type="button" onClick={toggleFull} title={full ? 'Exit full screen' : 'Full screen'}
              className="h-8 px-2.5 rounded-lg bg-white/95 shadow border border-slate-200 text-[11.5px] font-bold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer">
              {full ? <><Minimize2 size={13} /> Exit</> : <><Maximize2 size={13} /> Full screen</>}
            </button>
          </div>
          <div className="absolute left-3 bottom-8 z-[500] flex items-center gap-2 flex-wrap bg-white/95 rounded-xl shadow border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
            {(['cleaner', 'driver', 'technical'] as LiveRole[]).map(r => (
              <span key={r} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[r] }} />{r === 'technical' ? 'Technical' : r === 'driver' ? 'Driver' : 'Cleaner'}</span>
            ))}
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${RING.live}` }} />Live</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${RING.stale}` }} />Last known</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${RING.checkin}` }} />Last job step</span>
          </div>
          {shown.length === 0 && (
            <div className="absolute inset-x-4 top-14 z-[500] pointer-events-none flex justify-center">
              <span className="px-3.5 py-2 rounded-xl bg-white/95 text-[12px] text-slate-600 shadow border border-slate-200 text-center max-w-md">
                Nobody is sharing a position right now. Staff open <b>My Duties</b> on their phone and press <b>Share my location</b>; a cleaner also shows at the place of today's last job step.
              </span>
            </div>
          )}
        </div>

        {/* R-OPS-20: drag to make the map taller / shorter (arrow keys work too); double-click = default height */}
        {!full && (
          <div role="separator" aria-orientation="horizontal" aria-label="Map height — drag to resize" aria-valuemin={MAP_H_MIN} aria-valuemax={MAP_H_MAX} aria-valuenow={mapH} tabIndex={0}
            onPointerDown={startDrag} onDoubleClick={() => nudge(MAP_H_DEFAULT - mapH)}
            onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); nudge(40) } if (e.key === 'ArrowUp') { e.preventDefault(); nudge(-40) } }}
            title="Drag to change the map height · double-click for the default"
            className="-mt-2 h-4 flex items-center justify-center cursor-ns-resize select-none touch-none group focus:outline-none">
            <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white border border-slate-200 shadow-sm text-[10.5px] font-semibold text-slate-500 group-hover:text-emerald-700 group-hover:border-emerald-300 group-focus:ring-2 group-focus:ring-emerald-300">
              <GripHorizontal size={13} /> {mapH}px
            </span>
          </div>
        )}

        {/* R-OPS-21: the map against the live jobs — who is on a job but has no position yet, and why */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
          <div className="flex items-center gap-2 flex-wrap text-[12px] font-bold">
            <span className="text-slate-700">Cleaners on duty now: {onJobNow}</span>
            <span className="text-emerald-700">· On the map: {people.length}</span>
            <span className={unplaced.length ? 'text-amber-700' : 'text-slate-400'}>· No position yet: {unplaced.length}</span>
            <span className="text-[11px] font-medium text-slate-400 ml-auto">Updates by itself — no refresh needed</span>
          </div>
          {unplaced.length > 0 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {unplaced.map(u => (
                <div key={u.id} className="flex gap-2 p-2 rounded-lg bg-amber-50/60 border border-amber-200 min-w-0" title={u.why}>
                  <MapPinOff size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold text-[#111827] truncate">{u.name}</span>
                    <span className="block text-[11px] text-slate-600 truncate">{u.task}</span>
                    <span className="block text-[10.5px] text-amber-700 truncate">{u.why}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* People under the map */}
        {shown.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {shown.map(p => (
              <button key={p.id} type="button" onClick={() => setFocus(p.id)}
                className={`w-full text-left flex gap-2.5 p-2.5 rounded-xl border-l-4 border transition-colors cursor-pointer bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${focus === p.id ? 'border-slate-300 ring-2 ring-emerald-100' : 'border-slate-100 hover:bg-slate-50'}`}
                style={{ borderLeftColor: COLOR[p.role] }}>
                <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[11px] font-black" style={{ background: COLOR[p.role], boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${RING[p.state]}` }}>
                  {p.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-[#111827] truncate">{p.name} <span className="font-semibold" style={{ color: COLOR[p.role] }}>· {p.roleLabel}</span></span>
                  <span className="block text-[11.5px] text-slate-600 truncate" title={p.task}>{p.task}</span>
                  <span className="block text-[10.5px] text-slate-400 truncate">{ageLabel(p.updatedAt, now)}{p.detail ? ` · ${p.detail}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>}
    </div>
  )
}
