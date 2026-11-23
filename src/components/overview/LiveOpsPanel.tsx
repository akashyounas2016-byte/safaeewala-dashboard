import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radar, Sparkles, Truck, Headset, Users, Maximize2, Minimize2, Crosshair } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { todayDubai } from '@/lib/dubaiTime'
import { fetchDriverLocations, subscribeDriverLocations, ageLabel, type DriverLocation } from '@/lib/driverLocation'
import { useJobCheckins } from '@/lib/jobCheckins'
import { useDayPlan } from '@/lib/driverPlans'
import { buildRouteSites } from '@/lib/driverRoutes'
import { buildLivePeople, type LiveRole } from '@/lib/liveOps'
import { dubaiMinutes } from '@/lib/overviewStats'

const LiveOpsMap = lazy(() => import('./LiveOpsMap'))
const COLOR: Record<LiveRole, string> = { cleaner: '#059669', driver: '#2563eb', csr: '#7c3aed' }
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
  const checkins = useJobCheckins(today)
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
    employees, locations, checkins: Object.values(checkins.rows), dailyJobs, date: today, nowMs: now, nowMin: dubaiMinutes(new Date(now)), plan, sites,
  }), [employees, locations, checkins.rows, dailyJobs, today, now, plan, sites])
  const shown = role === 'all' ? people : people.filter(p => p.role === role)
  const count = (r: LiveRole) => people.filter(p => p.role === r).length
  const live = people.filter(p => p.state === 'live').length
  const onFocus = useCallback((id: string) => setFocus(id), [])

  const chips: { id: 'all' | LiveRole; label: string; icon: typeof Users; n: number; color: string }[] = [
    { id: 'all', label: 'All', icon: Users, n: people.length, color: '#0f172a' },
    { id: 'cleaner', label: 'Cleaners', icon: Sparkles, n: count('cleaner'), color: COLOR.cleaner },
    { id: 'driver', label: 'Drivers', icon: Truck, n: count('driver'), color: COLOR.driver },
    { id: 'csr', label: 'CSR', icon: Headset, n: count('csr'), color: COLOR.csr },
  ]

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      {/* Colourful header */}
      <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2"><Radar size={20} /> Live Map</h3>
          <p className="text-[12.5px] text-white/85">Cleaners, drivers and CSR on duty — hover a bot for the person and their task</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-bold bg-white/15 border border-white/25 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-lime-300 animate-pulse" /> {live} live now
          </span>
          {chips.map(c => (
            <button key={c.id} type="button" onClick={() => setRole(c.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer transition-colors ${role === c.id ? 'bg-white shadow' : 'bg-white/15 hover:bg-white/25 text-white'}`}
              style={role === c.id ? { color: c.color } : undefined}>
              <c.icon size={13} /> {c.label}
              <span className="min-w-[18px] text-center px-1 rounded-md text-[11px]" style={role === c.id ? { background: c.color, color: '#fff' } : { background: 'rgba(255,255,255,.25)' }}>{c.n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Map — full width */}
        <div ref={boxRef} className={`relative ${full ? 'bg-white p-3' : ''}`} style={full ? { height: '100vh' } : undefined}>
          <Suspense fallback={<div className="w-full rounded-2xl bg-slate-100 animate-pulse" style={{ height: 560 }} />}>
            <LiveOpsMap people={shown} now={now} focusId={focus} onFocus={onFocus} fitSignal={fitSignal} height={full ? window.innerHeight - 24 : 560} />
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
            {(['cleaner', 'driver', 'csr'] as LiveRole[]).map(r => (
              <span key={r} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[r] }} />{r === 'csr' ? 'CSR' : r === 'driver' ? 'Driver' : 'Cleaner'}</span>
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

        {/* People under the map */}
        {shown.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {shown.map(p => (
              <button key={p.id} type="button" onClick={() => setFocus(p.id)}
                className={`w-full text-left flex gap-2.5 p-2.5 rounded-xl border-l-4 border transition-colors cursor-pointer ${focus === p.id ? 'bg-slate-50 border-slate-300' : 'border-slate-100 hover:bg-slate-50'}`}
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
      </div>
    </div>
  )
}
