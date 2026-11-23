import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Radar, Sparkles, Truck, Headset, Users } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { todayDubai } from '@/lib/dubaiTime'
import { fetchDriverLocations, subscribeDriverLocations, ageLabel, type DriverLocation } from '@/lib/driverLocation'
import { useJobCheckins } from '@/lib/jobCheckins'
import { useDayPlan } from '@/lib/driverPlans'
import { buildRouteSites } from '@/lib/driverRoutes'
import { buildLivePeople, type LiveRole } from '@/lib/liveOps'

const LiveOpsMap = lazy(() => import('./LiveOpsMap'))
const COLOR: Record<LiveRole, string> = { cleaner: '#059669', driver: '#2563eb', csr: '#7c3aed' }

/** Minutes since midnight in Dubai */
const dubaiMinutes = (d = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).split(':').map(Number)
  return (h % 24) * 60 + m
}

/**
 * R-OPS-14: Overview → Live map. Cleaners, drivers and CSR who share their position (My Duties), or whose last
 * job step today had one. Live through Supabase Realtime; reload every 30 s as a fallback.
 */
export function LiveOpsPanel() {
  const { employees, dailyJobs } = useData()
  const today = todayDubai()
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [role, setRole] = useState<'all' | LiveRole>('all')
  const [focus, setFocus] = useState<string | null>(null)
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

  const sites = useMemo(() => buildRouteSites(dailyJobs, today), [dailyJobs, today])
  const people = useMemo(() => buildLivePeople({
    employees, locations, checkins: Object.values(checkins.rows), dailyJobs, date: today, nowMs: now, nowMin: dubaiMinutes(new Date(now)), plan, sites,
  }), [employees, locations, checkins.rows, dailyJobs, today, now, plan, sites])
  const shown = role === 'all' ? people : people.filter(p => p.role === role)
  const count = (r: LiveRole) => people.filter(p => p.role === r).length
  const live = people.filter(p => p.state === 'live').length
  const onFocus = useCallback((id: string) => setFocus(id), [])

  const chips: { id: 'all' | LiveRole; label: string; icon: typeof Users; n: number }[] = [
    { id: 'all', label: 'All', icon: Users, n: people.length },
    { id: 'cleaner', label: 'Cleaners', icon: Sparkles, n: count('cleaner') },
    { id: 'driver', label: 'Drivers', icon: Truck, n: count('driver') },
    { id: 'csr', label: 'CSR', icon: Headset, n: count('csr') },
  ]

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-xl font-bold text-[#111827] mb-1 flex items-center gap-2"><Radar size={19} className="text-emerald-600" /> Live Map</h3>
          <p className="text-sm text-[#6B7280]">Cleaners, drivers and CSR on duty — hover a bot for the person and their task</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {live} live
          </span>
          {chips.map(c => (
            <button key={c.id} type="button" onClick={() => setRole(c.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer transition-colors ${role === c.id ? 'bg-[#111827] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <c.icon size={13} /> {c.label} <span className={role === c.id ? 'text-white/70' : 'text-slate-400'}>{c.n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        <div className="relative">
          <Suspense fallback={<div className="w-full rounded-2xl bg-slate-100 animate-pulse" style={{ height: 440 }} />}>
            <LiveOpsMap people={shown} now={now} focusId={focus} onFocus={onFocus} />
          </Suspense>
          {shown.length === 0 && (
            <div className="absolute inset-x-4 top-4 z-[500] pointer-events-none flex justify-center">
              <span className="px-3.5 py-2 rounded-xl bg-white/95 text-[12px] text-slate-600 shadow border border-slate-200 text-center max-w-md">
                Nobody is sharing a position right now. Staff open <b>My Duties</b> on their phone and press <b>Share my location</b>; a cleaner also shows at the place of today's last job step.
              </span>
            </div>
          )}
        </div>
        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
          <div className="flex items-center gap-3 text-[11px] text-slate-500 pb-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-emerald-400 bg-white" /> Live</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-400 bg-white" /> Last known</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-slate-400 bg-white" /> Last job step</span>
          </div>
          {shown.length === 0 && <p className="text-[12.5px] text-slate-400 py-6 text-center">No one on the map.</p>}
          {shown.map(p => (
            <button key={p.id} type="button" onClick={() => setFocus(p.id)}
              className={`w-full text-left flex gap-2.5 p-2.5 rounded-xl border transition-colors cursor-pointer ${focus === p.id ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-100 hover:bg-slate-50'}`}>
              <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[11px] font-black" style={{ background: COLOR[p.role], boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${p.state === 'live' ? '#22c55e' : p.state === 'stale' ? '#f59e0b' : '#94a3b8'}` }}>
                {p.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-[#111827] truncate">{p.name} <span className="font-semibold text-slate-400">· {p.roleLabel}</span></span>
                <span className="block text-[11.5px] text-slate-600 truncate" title={p.task}>{p.task}</span>
                <span className="block text-[10.5px] text-slate-400">{ageLabel(p.updatedAt, now)}{p.detail ? ` · ${p.detail}` : ''}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
