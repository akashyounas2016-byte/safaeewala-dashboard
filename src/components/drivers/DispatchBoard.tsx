import { useMemo, useState } from 'react'
import { MapPin, UserPlus, Truck, Users, Clock } from 'lucide-react'
import type { DailyJob, Employee } from '@/types'
import { useData } from '@/store/DataContext'
import { areasOnDate, areaKey, cleanerSuggestions } from '@/lib/dispatch'
import { awayCleanerNames, buildCleanerRoster } from '@/lib/attendance'
import { splitStaffNames, isBogusJob } from '@/lib/clientDataSync'
import { findStaffClash, clashMessage } from '@/lib/shiftClash'
import { formatTime12h } from '@/lib/utils'
import { notify } from '@/lib/notify'
import type { RouteSite } from '@/lib/driverRoutes'
import { useJobCheckins, checkinId, CHECKIN_LABEL } from '@/lib/jobCheckins'

const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'

/**
 * R-DRV-04: dispatch by area — pick an area, see its jobs for the day, the free cleaners ranked for
 * each job, and the driver serving the area. Assigning writes to the Daily Job Sheet / route plan at once.
 */
export function DispatchBoard({ date, drivers, sites, driverOf, onAssignDriver }: {
  date: string
  drivers: Employee[]
  sites: RouteSite[]
  driverOf: (siteKey: string) => string
  onAssignDriver: (siteKey: string, driverId: string) => void
}) {
  const { dailyJobs, employees, attendanceMarks, updateDailyJob } = useData()
  const areas = useMemo(() => areasOnDate(dailyJobs, date), [dailyJobs, date])
  const [area, setArea] = useState('')
  const current = area || areas[0]?.area || ''

  const driverIds = new Set(drivers.map(d => d.id))
  const roster = useMemo(() => {
    const driverNames = new Set(employees.filter(e => e.role === 'driver').map(e => e.full_name.toLowerCase()))
    return buildCleanerRoster(employees.filter(e => !driverIds.has(e.id)), dailyJobs, date).filter(n => !driverNames.has(n.toLowerCase()))
  }, [employees, dailyJobs, date]) // eslint-disable-line react-hooks/exhaustive-deps
  const checkins = useJobCheckins(date) // R-DUTY-01: progress from My Duties, live
  const away = useMemo(() => awayCleanerNames(attendanceMarks || {}, employees, date), [attendanceMarks, employees, date])

  const jobs = dailyJobs
    .filter(j => j.date === date && !isBogusJob(j) && (areaKey(j.area) || '(no area)') === (areaKey(current) || '(no area)'))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))

  const assignCleaner = (job: DailyJob, name: string) => {
    const others = dailyJobs.filter(j => j.id !== job.id)
    const clash = findStaffClash(others, { staff_name: name, date: job.date, start_time: job.start_time, end_time: job.end_time })
    if (clash) { notify.error(`⛔ ${clashMessage(clash)}`); return }
    const current = splitStaffNames(job.staff_name || '')
    updateDailyJob(job.id, { staff_name: [...current, name].join(', ') })
    notify.success(`${name} assigned to ${job.address || 'the job'}`)
  }

  const siteOf = (job: DailyJob) => sites.find(s => s.jobIds.includes(job.id))

  if (areas.length === 0) {
    return <div className={`${card} p-10 text-center text-[13px] text-slate-400`}>No jobs on this date.</div>
  }

  return (
    <div className="space-y-4">
      {/* Area picker */}
      <section className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={16} className="text-emerald-700" />
          <h3 className="text-[14px] font-bold text-slate-900">Choose an area</h3>
          <span className="text-[11.5px] text-slate-500">· red number = jobs without a cleaner</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {areas.map(a => (
            <button key={a.area} type="button" onClick={() => setArea(a.area)}
              className={`px-3 py-1.5 rounded-xl text-[12.5px] font-bold border cursor-pointer flex items-center gap-1.5 ${current === a.area ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'}`}>
              {a.area}
              <span className={`text-[10.5px] px-1.5 rounded-full ${current === a.area ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{a.jobs}</span>
              {a.open > 0 && <span className="text-[10.5px] px-1.5 rounded-full bg-rose-500 text-white">{a.open}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Jobs in the area */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {jobs.map(job => {
          const staff = splitStaffNames(job.staff_name || '')
          const site = siteOf(job)
          const driverId = site ? driverOf(site.key) : ''
          const suggestions = cleanerSuggestions(dailyJobs, job, roster, away)
          return (
            <div key={job.id} className={`${card} p-4 space-y-3 ${staff.length === 0 ? 'ring-2 ring-rose-200' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-slate-900 truncate">{job.address || 'No address'}</p>
                  <p className="text-[11.5px] text-slate-500 flex items-center gap-1"><Clock size={11} />{formatTime12h(job.start_time)} – {formatTime12h(job.end_time)} · {job.area || 'no area'}</p>
                </div>
                <span className={`shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${staff.length === 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {staff.length === 0 ? 'No cleaner' : `${staff.length} cleaner${staff.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                <Users size={13} className="text-slate-400" />
                {staff.length === 0 ? <span className="text-slate-400">Unassigned</span> : staff.map(n => {
                  const ck = checkins.rows[checkinId(job.id, n)]
                  return (
                    <span key={n} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-semibold" title={ck?.note || undefined}>
                      {n}{ck && <span className={`ml-1 text-[10px] font-bold ${ck.status === 'issue' ? 'text-rose-600' : ck.status === 'done' ? 'text-emerald-700' : 'text-sky-700'}`}>· {CHECKIN_LABEL[ck.status]}</span>}
                    </span>
                  )
                })}
              </div>

              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Suggested cleaners (free at this time)</p>
                {suggestions.length === 0 ? <p className="text-[12px] text-slate-400">Nobody else is free at this time.</p> : (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(s => (
                      <button key={s.name} type="button" onClick={() => assignCleaner(job, s.name)} title={s.reason}
                        className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold border flex items-center gap-1 cursor-pointer ${s.sameArea ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'}`}>
                        <UserPlus size={12} />{s.name}
                        <span className="font-semibold text-[10px] text-slate-500">· {s.sameArea ? 'in area' : `${s.jobsToday} job${s.jobsToday === 1 ? '' : 's'}`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {site && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <Truck size={14} className="text-slate-400" />
                  <select value={driverId} onChange={e => onAssignDriver(site.key, e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-[12px] font-semibold border border-slate-200 rounded-lg bg-white text-slate-800 cursor-pointer">
                    <option value="">No driver</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
