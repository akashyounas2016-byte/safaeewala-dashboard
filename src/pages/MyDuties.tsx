import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned, Navigation, Square } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { fmtDate } from '@/components/dailyJobSheet/jobSheetUtils'
import { activeDrivers, buildRouteSites, googleMapsRouteUrl } from '@/lib/driverRoutes'
import { useDayPlan } from '@/lib/driverPlans'
import { startLocationSharing } from '@/lib/driverLocation'
import { SiteCard } from '@/components/drivers/SiteCard'

/**
 * My Duties — the driver's phone view (R-DRV-02, R-DRV-03): today's stops in order with drop and
 * pick-up times, the route in Google Maps, and live location sharing while on shift.
 * No OT, no Material, no prices other than cash to collect.
 */
export function MyDuties() {
  const { user } = useAuth()
  const { dailyJobs, employees } = useData()
  const drivers = useMemo(() => activeDrivers(employees), [employees])
  const linked = drivers.find(d => d.id === user?.employee_id)
  // Office users can preview any driver's view
  const [previewId, setPreviewId] = useState('')
  const driver = linked || drivers.find(d => d.id === previewId)
  const [date, setDate] = useState(() => todayDubai())
  const [plan] = useDayPlan(date)
  const sites = useMemo(() => buildRouteSites(dailyJobs, date), [dailyJobs, date])
  const own = driver ? sites.filter(s => plan.assignments[s.key] === driver.id) : []
  const shift = driver ? { vehicle: driver.assigned_vehicle, ...plan.shifts[driver.id] } : undefined
  const route = googleMapsRouteUrl(own)

  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  const toggleSharing = () => {
    if (!linked) return
    if (sharing) { stopRef.current?.(); stopRef.current = null; setSharing(false); return }
    setShareError(null)
    stopRef.current = startLocationSharing(linked.id, msg => setShareError(msg))
    setSharing(true)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-[24px] p-5">
        <p className="text-[12px] text-emerald-200 font-semibold">My duties</p>
        <h1 className="text-[22px] font-black">{driver?.full_name || user?.full_name || 'Driver'}</h1>
        <p className="text-[12.5px] text-emerald-100 mt-0.5">
          {fmtDate(date)}{shift?.start || shift?.end ? ` · Shift ${shift?.start || '—'} – ${shift?.end || '—'}` : ''}{shift?.vehicle ? ` · ${shift.vehicle}` : ''}
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button type="button" onClick={() => setDate(d => addDays(d, -1))} className="px-3 py-1.5 rounded-xl bg-white/10 text-[12px] font-bold hover:bg-white/20 cursor-pointer">◀ Previous day</button>
          <button type="button" onClick={() => setDate(todayDubai())} className="px-3 py-1.5 rounded-xl bg-white/10 text-[12px] font-bold hover:bg-white/20 cursor-pointer">Today</button>
          <button type="button" onClick={() => setDate(d => addDays(d, 1))} className="px-3 py-1.5 rounded-xl bg-white/10 text-[12px] font-bold hover:bg-white/20 cursor-pointer">Next day ▶</button>
        </div>
      </div>

      {!linked && (
        <div className="px-4 py-3 rounded-2xl border border-sky-200 bg-sky-50 text-[12.5px] text-sky-900 flex items-center gap-2 flex-wrap">
          <span>This login is not linked to a driver. Preview a driver:</span>
          <select value={previewId} onChange={e => setPreviewId(e.target.value)} className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-[12.5px]">
            <option value="">— choose —</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>
      )}

      {driver && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href={route || undefined} target="_blank" rel="noopener noreferrer"
            className={`rounded-2xl p-4 flex items-center gap-3 font-bold text-[14px] ${route ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}>
            <Navigation size={20} /> Open my route in Google Maps
          </a>
          <button type="button" onClick={toggleSharing} disabled={!linked}
            className={`rounded-2xl p-4 flex items-center gap-3 font-bold text-[14px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sharing ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
            {sharing ? <><Square size={18} /> Stop sharing my location</> : <><MapPinned size={20} /> Start shift — share my location</>}
          </button>
        </div>
      )}
      {sharing && <p className="text-[12px] text-emerald-800 font-semibold">● Sharing your location with the office while this page is open.</p>}
      {shareError && <p className="text-[12px] text-rose-700 font-semibold">{shareError}</p>}

      {driver && (own.length === 0
        ? <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-8 text-center text-[13px] text-slate-400">No stops assigned for {fmtDate(date)}.</div>
        : <div className="space-y-3">{own.map(s => <SiteCard key={s.key} site={s} index={sites.indexOf(s)} />)}</div>)}
    </div>
  )
}
