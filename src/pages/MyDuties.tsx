import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapPinned, Navigation, Square, ChevronLeft, ChevronRight, Clock, MapPin, Users, Truck,
  Banknote, Lock, Eye, Package, CalendarDays, Sparkles,
} from 'lucide-react'
import { useData } from '@/store/DataContext'
import { useAuth } from '@/store/UserContext'
import { useFieldStaff } from '@/store/useFieldStaff'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { fmtDate } from '@/components/dailyJobSheet/jobSheetUtils'
import { activeDrivers, buildRouteSites, googleMapsRouteUrl } from '@/lib/driverRoutes'
import { useDayPlan } from '@/lib/driverPlans'
import { startLocationSharing } from '@/lib/driverLocation'
import { SiteCard } from '@/components/drivers/SiteCard'
import { canApproveLeave, findMark, weekdayOf } from '@/lib/attendance'
import { cleanerDuties, dutyKindOf, mapsSearchUrl, type CleanerDuty, type DutyKind } from '@/lib/duties'
import type { Employee } from '@/types'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * My Duties — the field worker's phone screen (R-SEC-05, R-DRV-02, R-DRV-03, UX-65).
 *  - A cleaner sees only their own jobs: time, site, team, driver, material, cash to collect.
 *  - A driver sees only their own route with drop / pick-up times and shares live location.
 *  - Admin / manager can preview any cleaner or driver; any other login sees nothing.
 * No OT, no charges other than cash to collect. Built for a phone first (future Android app).
 */
export function MyDuties() {
  const { user } = useAuth()
  const { dailyJobs, employees, attendanceMarks } = useData()
  const { employee: linked } = useFieldStaff()
  const isOffice = canApproveLeave(user?.role) // admin / manager

  // Office preview: pick a kind and a person
  const [previewKind, setPreviewKind] = useState<DutyKind>('cleaner')
  const [previewId, setPreviewId] = useState('')
  const drivers = useMemo(() => activeDrivers(employees), [employees])
  const cleaners = useMemo(() => employees
    .filter(e => e.role !== 'driver' && e.status !== 'inactive')
    .sort((a, b) => a.full_name.localeCompare(b.full_name)), [employees])

  // Whose duties are shown: a linked login only ever sees its own (R-SEC-05)
  const person: Employee | undefined = linked
    || (isOffice ? (previewKind === 'driver' ? drivers : cleaners).find(e => e.id === previewId) : undefined)
  const kind = dutyKindOf(person)

  const [date, setDate] = useState(() => todayDubai())
  const today = todayDubai()
  const [plan] = useDayPlan(date)

  // Driver view
  const sites = useMemo(() => buildRouteSites(dailyJobs, date), [dailyJobs, date])
  const stops = kind === 'driver' && person ? sites.filter(s => plan.assignments[s.key] === person.id) : []
  const shift = kind === 'driver' && person ? { vehicle: person.assigned_vehicle, ...plan.shifts[person.id] } : undefined
  const route = googleMapsRouteUrl(stops)

  // Cleaner view
  const duties = useMemo(
    () => (kind === 'cleaner' && person ? cleanerDuties(dailyJobs, person, date, plan, employees) : []),
    [kind, person, dailyJobs, date, plan, employees],
  )
  const totalHours = Math.round(duties.reduce((s, d) => s + d.hours, 0) * 10) / 10
  const cashTotal = duties.reduce((s, d) => s + d.cashToCollect, 0)
  const mark = person ? findMark(attendanceMarks, date, person.full_name, person.id) : undefined

  // Live location (drivers, own login only)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  const canShare = !!linked && kind === 'driver'
  const toggleSharing = () => {
    if (!canShare || !linked) return
    if (sharing) { stopRef.current?.(); stopRef.current = null; setSharing(false); return }
    setShareError(null)
    stopRef.current = startLocationSharing(linked.id, msg => setShareError(msg))
    setSharing(true)
  }

  // A login that is not linked to a staff record and is not office: nothing to show
  if (!linked && !isOffice) {
    return (
      <div className="w-full max-w-md mx-auto mt-10 bg-white rounded-[22px] border border-[#E4E8EC] p-7 text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500"><Lock size={22} /></div>
        <h1 className="text-[17px] font-black text-[#111827]">No duties for this login</h1>
        <p className="text-[13px] text-slate-500">This login is not linked to a cleaner or driver. Ask the admin to link it in Settings → Users.</p>
      </div>
    )
  }

  const strip = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3))
  const count = kind === 'driver' ? stops.length : duties.length
  const countWord = kind === 'driver' ? (count === 1 ? 'stop' : 'stops') : (count === 1 ? 'job' : 'jobs')

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3 sm:space-y-4">
      {/* Header — full width of the page column on every screen size */}
      <div className="w-full bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-[22px] sm:rounded-[24px] p-4 sm:p-6 shadow-[0_8px_32px_rgba(6,78,59,0.25)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11.5px] text-emerald-200 font-bold uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
              {kind === 'driver' ? <Truck size={13} /> : <Sparkles size={13} />}
              {kind === 'driver' ? 'Driver duties' : kind === 'cleaner' ? 'Cleaner duties' : 'My duties'}
              {!linked && isOffice && <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px]">Office preview</span>}
            </p>
            <h1 className="text-[20px] sm:text-[24px] font-black leading-tight truncate">{person?.full_name || 'Choose a person'}</h1>
            <p className="text-[12.5px] text-emerald-100 mt-0.5">
              {fmtDate(date)}
              {shift?.start || shift?.end ? ` · Shift ${shift?.start || '—'} – ${shift?.end || '—'}` : ''}
              {shift?.vehicle ? ` · ${shift.vehicle}` : ''}
              {kind === 'cleaner' && totalHours > 0 ? ` · ${totalHours}h` : ''}
            </p>
          </div>
          {person && (
            <div className="shrink-0 text-right">
              <p className="text-[24px] sm:text-[28px] font-black leading-none">{count}</p>
              <p className="text-[11px] text-emerald-200 font-bold mt-1">{countWord}</p>
            </div>
          )}
        </div>
      </div>

      {/* Date bar — stays on top while scrolling; big tap targets */}
      <div className="sticky top-0 z-20 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-[#f0f4f3]/95 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day"
            className="w-11 h-11 shrink-0 rounded-xl bg-white border border-[#E4E8EC] flex items-center justify-center text-slate-700 active:bg-slate-100 cursor-pointer">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1 min-w-0">
            {strip.map(d => {
              const sel = d === date
              return (
                <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={sel}
                  className={`h-11 rounded-xl flex flex-col items-center justify-center leading-none border cursor-pointer transition-colors ${
                    sel ? 'bg-emerald-700 text-white border-emerald-700' : d === today ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-white text-slate-700 border-[#E4E8EC] active:bg-slate-100'
                  }`}>
                  <span className="text-[9.5px] font-bold uppercase opacity-80">{WEEKDAY[weekdayOf(d)]}</span>
                  <span className="text-[14px] font-black mt-0.5">{Number(d.slice(8))}</span>
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day"
            className="w-11 h-11 shrink-0 rounded-xl bg-white border border-[#E4E8EC] flex items-center justify-center text-slate-700 active:bg-slate-100 cursor-pointer">
            <ChevronRight size={18} />
          </button>
        </div>
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="mt-1.5 h-8 text-[12px] font-bold text-emerald-700 flex items-center gap-1 cursor-pointer">
            <CalendarDays size={13} /> Back to today
          </button>
        )}
      </div>

      {/* Office preview (admin / manager only) */}
      {!linked && isOffice && (
        <div className="px-3.5 py-3 rounded-2xl border border-sky-200 bg-sky-50 text-[12.5px] text-sky-900 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="flex items-center gap-1.5 font-bold"><Eye size={14} /> Preview as</span>
          <div className="flex rounded-xl bg-white border border-sky-200 p-0.5 w-full sm:w-auto">
            {(['cleaner', 'driver'] as const).map(k => (
              <button key={k} type="button" onClick={() => { setPreviewKind(k); setPreviewId('') }}
                className={`flex-1 sm:flex-none px-3 h-9 rounded-lg text-[12.5px] font-bold cursor-pointer ${previewKind === k ? 'bg-sky-600 text-white' : 'text-sky-800'}`}>
                {k === 'cleaner' ? 'Cleaner' : 'Driver'}
              </button>
            ))}
          </div>
          <select value={previewId} onChange={e => setPreviewId(e.target.value)}
            className="w-full sm:w-auto sm:min-w-[220px] h-10 px-2.5 rounded-xl border border-sky-300 bg-white text-[13px] font-semibold">
            <option value="">— choose a {previewKind} —</option>
            {(previewKind === 'driver' ? drivers : cleaners).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
      )}

      {/* Attendance for the day (R-ATT-05) */}
      {person && (mark?.status === 'absent' || mark?.status === 'on_leave') && (
        <div className={`px-4 py-3 rounded-2xl border text-[13px] font-semibold ${mark.status === 'on_leave' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          {mark.status === 'on_leave'
            ? (mark.approval === 'pending' ? 'Leave requested — waiting for approval' : 'On leave this day')
            : 'Marked absent this day'}
          {mark.reason ? <span className="font-normal"> · {mark.reason}</span> : null}
        </div>
      )}

      {/* ── Driver ── */}
      {person && kind === 'driver' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <a href={route || undefined} target="_blank" rel="noopener noreferrer"
              className={`min-h-[52px] rounded-2xl px-4 py-3 flex items-center gap-3 font-bold text-[14px] ${route ? 'bg-sky-600 text-white active:bg-sky-700' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}>
              <Navigation size={20} /> Open my route in Google Maps
            </a>
            <button type="button" onClick={toggleSharing} disabled={!canShare}
              className={`min-h-[52px] rounded-2xl px-4 py-3 flex items-center gap-3 font-bold text-[14px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sharing ? 'bg-rose-600 text-white active:bg-rose-700' : 'bg-emerald-700 text-white active:bg-emerald-800'}`}>
              {sharing ? <><Square size={18} /> Stop sharing my location</> : <><MapPinned size={20} /> Start shift — share my location</>}
            </button>
          </div>
          {sharing && <p className="text-[12px] text-emerald-800 font-semibold">● Sharing your location with the office while this page is open.</p>}
          {shareError && <p className="text-[12px] text-rose-700 font-semibold">{shareError}</p>}
          {stops.length === 0
            ? <EmptyDay text={`No stops assigned for ${fmtDate(date)}.`} />
            : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{stops.map(s => <SiteCard key={s.key} site={s} index={sites.indexOf(s)} />)}</div>}
        </>
      )}

      {/* ── Cleaner ── */}
      {person && kind === 'cleaner' && (
        <>
          {cashTotal > 0 && (
            <div className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-[13px] font-bold flex items-center gap-2">
              <Banknote size={17} className="text-amber-600" /> Cash to collect: AED {cashTotal}
            </div>
          )}
          {duties.length === 0
            ? <EmptyDay text={`No jobs for ${fmtDate(date)}.`} />
            : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{duties.map((d, i) => <DutyCard key={d.job.id} duty={d} index={i} />)}</div>}
        </>
      )}
    </div>
  )
}

function EmptyDay({ text }: { text: string }) {
  return <div className="bg-white rounded-[22px] border border-[#E4E8EC] p-8 text-center text-[13px] text-slate-400">{text}</div>
}

/** One cleaning job on the cleaner's phone */
function DutyCard({ duty: d, index }: { duty: CleanerDuty; index: number }) {
  const material = String(d.job.material || '').trim()
  return (
    <div className="bg-white rounded-2xl border border-[#E4E8EC] shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-emerald-50/70 border-b border-emerald-100">
        <span className="flex items-center gap-2 text-[15px] font-black text-emerald-950">
          <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-[11px] flex items-center justify-center">{index + 1}</span>
          <Clock size={14} className="text-emerald-700" /> {d.start || '—'} – {d.end || '—'}
        </span>
        {d.hours > 0 && <span className="text-[11.5px] font-black px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800">{d.hours}h</span>}
      </div>
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-black text-[#111827] leading-snug break-words">{d.site}</p>
            {d.area && <p className="text-[12.5px] text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {d.area}</p>}
          </div>
          <a href={mapsSearchUrl(d.site, d.area)} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Maps"
            className="shrink-0 w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center active:bg-sky-700">
            <Navigation size={18} />
          </a>
        </div>
        {d.job.service && <p className="text-[12.5px] font-semibold text-slate-700">{d.job.service}</p>}
        <div className="flex flex-wrap gap-1.5">
          {d.teammates.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
              <Users size={12} /> With {d.teammates.join(', ')}
            </span>
          )}
          {material && !/^no$/i.test(material) && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold px-2 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200">
              <Package size={12} /> Material: {material}
            </span>
          )}
          {d.cashToCollect > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              <Banknote size={12} /> Collect AED {d.cashToCollect}
            </span>
          )}
        </div>
        {d.driver && (
          <p className="text-[12px] text-slate-600 flex items-center gap-1.5">
            <Truck size={13} className="text-slate-500 shrink-0" /> {d.driver.name} · drop {d.driver.drop || '—'} · pick-up {d.driver.pickup || '—'}
          </p>
        )}
        {d.job.remarks && d.job.remarks !== '—' && <p className="text-[12px] text-slate-500 italic break-words">{d.job.remarks}</p>}
      </div>
    </div>
  )
}
