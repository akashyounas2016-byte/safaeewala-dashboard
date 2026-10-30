import { useEffect, useMemo, useState } from 'react'
import { Car, MapPinned, Navigation, Route, Shuffle, Truck } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { useData } from '@/store/DataContext'
import { todayDubai } from '@/lib/dubaiTime'
import { fmtDate } from '@/components/dailyJobSheet/jobSheetUtils'
import { activeDrivers, buildRouteSites, googleMapsRouteUrl, sheetSignature, type RouteSite } from '@/lib/driverRoutes'
import { useDayPlan, type DriverShift } from '@/lib/driverPlans'
import { ageLabel, fetchDriverLocations, osmEmbedUrl, type DriverLocation } from '@/lib/driverLocation'
import { SiteCard } from '@/components/drivers/SiteCard'
import { DriverSheetActions } from '@/components/drivers/DriverSheetActions'
import { notify } from '@/lib/notify'

type Tab = 'routes' | 'drivers' | 'live'
const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'

/**
 * Drivers module (R-DRV-01…03): route plan built live from the Daily Job Sheet, driver shifts
 * and duty sheets (no OT / Material), and live location while a driver shares it.
 */
export function Drivers() {
  const { dailyJobs, employees } = useData()
  const [date, setDate] = useState(() => todayDubai())
  const [tab, setTab] = useState<Tab>('routes')
  const [plan, updatePlan] = useDayPlan(date)

  const drivers = useMemo(() => activeDrivers(employees), [employees])
  const sites = useMemo(() => buildRouteSites(dailyJobs, date), [dailyJobs, date])
  const sitesOf = (driverId: string): RouteSite[] => sites.filter(s => plan.assignments[s.key] === driverId)
  const unassigned = sites.filter(s => !plan.assignments[s.key] || !drivers.some(d => d.id === plan.assignments[s.key]))
  const cleanerCount = new Set(sites.flatMap(s => s.cleaners)).size
  const dateLabel = fmtDate(date)

  const assign = (siteKey: string, driverId: string) =>
    updatePlan(p => {
      const assignments = { ...p.assignments }
      if (driverId) assignments[siteKey] = driverId
      else delete assignments[siteKey]
      return { ...p, assignments }
    })

  /** Same area → same driver; areas shared out so drivers get similar numbers of stops */
  const autoAssign = () => {
    if (drivers.length === 0) { notify.error('No active drivers — add employees with the Driver role first.'); return }
    const byArea = new Map<string, RouteSite[]>()
    unassigned.forEach(s => {
      const a = (s.area || s.name).toLowerCase()
      if (!byArea.has(a)) byArea.set(a, [])
      byArea.get(a)!.push(s)
    })
    const load = new Map(drivers.map(d => [d.id, sitesOf(d.id).length]))
    const areas = Array.from(byArea.values()).sort((a, b) => b.length - a.length)
    updatePlan(p => {
      const assignments = { ...p.assignments }
      areas.forEach(group => {
        const target = drivers.reduce((best, d) => (load.get(d.id)! < load.get(best.id)! ? d : best), drivers[0])
        group.forEach(s => { assignments[s.key] = target.id })
        load.set(target.id, load.get(target.id)! + group.length)
      })
      return { ...p, assignments }
    })
    notify.success(`${unassigned.length} stop${unassigned.length === 1 ? '' : 's'} assigned by area`)
  }

  const setShift = (driverId: string, patch: Partial<DriverShift>) =>
    updatePlan(p => ({ ...p, shifts: { ...p.shifts, [driverId]: { ...p.shifts[driverId], ...patch } } }))
  const markSent = (driverId: string, signature: string) =>
    updatePlan(p => ({ ...p, sent: { ...p.sent, [driverId]: { at: new Date().toISOString(), signature } } }))

  const tabs: { id: Tab; label: string; icon: typeof Route }[] = [
    { id: 'routes', label: 'Route plan', icon: Route },
    { id: 'drivers', label: 'Drivers & duty sheets', icon: Car },
    { id: 'live', label: 'Live location', icon: MapPinned },
  ]

  return (
    <div className="space-y-5">
      <PageHero
        title="Drivers"
        subtitle={`Pick-up & drop plan from the Daily Job Sheet · ${dateLabel}`}
        statusChip={`${sites.length} stops · ${cleanerCount} cleaners · ${drivers.length} drivers`}
        actions={
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 text-[12.5px] font-bold border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-emerald-500" />
        }
      />

      <div className="flex gap-1 bg-slate-100/90 p-1 rounded-2xl border border-[#E4E8EC] w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer ${tab === t.id ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {drivers.length === 0 && (
        <div className="px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 text-[12.5px] text-amber-900">
          No active drivers yet. Add an employee with the <b>Driver</b> role on the Employees screen to assign stops.
        </div>
      )}

      {tab === 'routes' && (
        <div className="space-y-5">
          {sites.length === 0 ? (
            <div className={`${card} p-10 text-center text-[13px] text-slate-400`}>No jobs on the Daily Job Sheet for {dateLabel}.</div>
          ) : (
            <>
              <section className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <h3 className="text-[15px] font-bold text-[#111827]">Not assigned yet <span className="text-slate-400 font-semibold">({unassigned.length})</span></h3>
                    <p className="text-[12px] text-slate-500">Each card is one site: its cleaners, when to drop them and when to pick them up. Choose a driver on the card.</p>
                  </div>
                  {unassigned.length > 0 && drivers.length > 0 && (
                    <button type="button" onClick={autoAssign} className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-[12.5px] font-bold hover:bg-emerald-800 cursor-pointer flex items-center gap-1.5">
                      <Shuffle size={14} /> Auto-assign by area
                    </button>
                  )}
                </div>
                {unassigned.length === 0
                  ? <p className="text-[12.5px] text-emerald-700 font-semibold">Every stop has a driver.</p>
                  : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {unassigned.map(s => <SiteCard key={s.key} site={s} index={sites.indexOf(s)} drivers={drivers} driverId="" onAssign={id => assign(s.key, id)} />)}
                    </div>}
              </section>

              {drivers.filter(d => sitesOf(d.id).length > 0).map(d => {
                const own = sitesOf(d.id)
                const route = googleMapsRouteUrl(own)
                return (
                  <section key={d.id} className={`${card} p-5`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                      <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2">
                        <Truck size={16} className="text-emerald-700" /> {d.full_name}
                        <span className="text-[12px] font-semibold text-slate-500">· {own.length} stop{own.length === 1 ? '' : 's'} · {new Set(own.flatMap(s => s.cleaners)).size} cleaners</span>
                      </h3>
                      {route && <a href={route} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Navigation size={13} /> Open route in Google Maps</a>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {own.map(s => <SiteCard key={s.key} site={s} index={sites.indexOf(s)} drivers={drivers} driverId={d.id} onAssign={id => assign(s.key, id)} />)}
                    </div>
                  </section>
                )
              })}
            </>
          )}
        </div>
      )}

      {tab === 'drivers' && (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-[#f8fafc] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-2.5">Driver</th>
                  <th className="text-left px-3 py-2.5">Shift</th>
                  <th className="text-left px-3 py-2.5">Vehicle</th>
                  <th className="text-left px-3 py-2.5">Duties</th>
                  <th className="text-left px-3 py-2.5">Sheet</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map(d => {
                  const own = sitesOf(d.id)
                  const shift = { vehicle: d.assigned_vehicle, ...plan.shifts[d.id] }
                  const sent = plan.sent[d.id]
                  const changed = sent && sent.signature !== sheetSignature(own)
                  const timeInput = (field: 'start' | 'end') => (
                    <input type="time" value={shift[field] || ''} onChange={e => setShift(d.id, { [field]: e.target.value })}
                      className="px-2 py-1 border border-slate-200 rounded-lg text-[12px] w-[96px]" />
                  )
                  return (
                    <tr key={d.id}>
                      <td className="px-5 py-3">
                        <p className="font-bold text-slate-800">{d.full_name}</p>
                        <p className="text-[11px] text-slate-500">{d.phone || 'no phone'}</p>
                      </td>
                      <td className="px-3 py-3"><div className="flex items-center gap-1">{timeInput('start')}<span className="text-slate-400">–</span>{timeInput('end')}</div></td>
                      <td className="px-3 py-3">
                        <input value={shift.vehicle || ''} placeholder="Plate / van" onChange={e => setShift(d.id, { vehicle: e.target.value })}
                          className="px-2 py-1 border border-slate-200 rounded-lg text-[12px] w-[120px]" />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{own.length} stop{own.length === 1 ? '' : 's'}{own[0] ? <span className="text-slate-400"> · first drop {own[0].dropTime || '—'}</span> : null}</td>
                      <td className="px-3 py-3">
                        {!sent ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Not sent</span>
                          : changed ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800" title="The job sheet changed after it was sent">Changed — send again</span>
                          : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Sent {ageLabel(sent.at)}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <DriverSheetActions driver={d} sites={own} date={date} dateLabel={dateLabel} shift={shift} onSent={sig => markSent(d.id, sig)} />
                      </td>
                    </tr>
                  )
                })}
                {drivers.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No active drivers.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11.5px] text-slate-400 border-t border-slate-100">Duty sheets come straight from the Daily Job Sheet and never include OT or Material. If the job sheet changes after sending, the sheet shows “Changed — send again”.</p>
        </div>
      )}

      {tab === 'live' && <LiveLocations drivers={drivers} />}
    </div>
  )
}

/** Latest position of each driver who shares it from My Duties (R-DRV-03) */
function LiveLocations({ drivers }: { drivers: ReturnType<typeof activeDrivers> }) {
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    const load = () => fetchDriverLocations().then(l => { if (alive) { setLocations(l); setNow(Date.now()) } })
    void load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const byDriver = new Map(locations.map(l => [l.employee_id, l]))
  const current = selected ? byDriver.get(selected) : locations.find(l => l.sharing)
  const isLive = (l?: DriverLocation) => !!l && l.sharing && now - new Date(l.updated_at).getTime() < 5 * 60_000

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className={`${card} divide-y divide-slate-100 overflow-hidden`}>
        {drivers.map(d => {
          const l = byDriver.get(d.id)
          return (
            <button key={d.id} type="button" disabled={!l} onClick={() => setSelected(d.id)}
              className={`w-full px-4 py-3 text-left flex items-center gap-3 cursor-pointer disabled:cursor-default ${selected === d.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${isLive(l) ? 'bg-emerald-500 animate-pulse' : l ? 'bg-amber-400' : 'bg-slate-300'}`} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-slate-800">{d.full_name}</span>
                <span className="block text-[11px] text-slate-500">{l ? `${isLive(l) ? 'Live' : l.sharing ? 'No signal' : 'Stopped sharing'} · ${ageLabel(l.updated_at, now)}` : 'Not shared yet'}</span>
              </span>
            </button>
          )
        })}
        {drivers.length === 0 && <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">No active drivers.</p>}
      </div>
      <div className={`${card} overflow-hidden min-h-[360px] flex flex-col`}>
        {current ? (
          <>
            <iframe title="Driver location" src={osmEmbedUrl(current.lat, current.lng)} className="w-full flex-1 min-h-[360px] border-0" loading="lazy" />
            <div className="px-4 py-2.5 flex items-center justify-between gap-2 text-[12px] border-t border-slate-100">
              <span className="text-slate-600">{drivers.find(d => d.id === current.employee_id)?.full_name} · updated {ageLabel(current.updated_at, now)}{current.accuracy ? ` · ±${Math.round(current.accuracy)} m` : ''}</span>
              <a href={`https://www.google.com/maps?q=${current.lat},${current.lng}`} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-800 hover:underline">Open in Google Maps</a>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-[12.5px] text-slate-400">
            No live position yet. A driver starts sharing from <b className="mx-1">My Duties</b> on their phone after signing in.
          </div>
        )}
      </div>
    </div>
  )
}
