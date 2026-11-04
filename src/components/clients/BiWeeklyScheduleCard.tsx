import { CalendarRange, Clock, Users, CalendarClock } from 'lucide-react'
import { DAYS_OF_WEEK, DAY_SHORT } from '@/components/monthlyClients/AddMonthlyClientModalForm'
import { biweeklyEndDate, biweeklyVisitDates, type BiWeeklyPlan, type BiWeeklyDay } from '@/lib/biweekly'
import { todayDubai } from '@/lib/dubaiTime'
import { ContractCalendar } from '@/components/clients/ContractCalendar'

const toMin = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const toTime = (min: number) => { const v = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}` }
const hoursBetween = (s: string, e: string) => Math.max(0, Math.round(((toMin(e) - toMin(s) + 1440) % 1440) / 30) / 2)

export function emptyBiWeeklyPlan(): BiWeeklyPlan {
  return { days: [], day_schedules: {}, start_date: todayDubai(), months: 3 }
}

/**
 * R-CLI-02: Bi-Weekly mode of Add New Client — the weekdays (same table as the monthly 7-day schedule:
 * day, start, end, duration, cleaner) and how many months the service runs. Visits are every other week.
 */
export function BiWeeklyScheduleCard({ plan, onChange, cleaners }: { plan: BiWeeklyPlan; onChange: (p: BiWeeklyPlan) => void; cleaners: string[] }) {
  const rowOf = (day: string): BiWeeklyDay => plan.day_schedules[day] || { startTime: '09:00', endTime: '13:00', cleaner: '', duration: 4 }
  const setRow = (day: string, patch: Partial<BiWeeklyDay>) => {
    const row = { ...rowOf(day), ...patch }
    if ('duration' in patch) row.endTime = toTime(toMin(row.startTime) + row.duration * 60)
    else if ('startTime' in patch || 'endTime' in patch) row.duration = hoursBetween(row.startTime, row.endTime)
    onChange({ ...plan, day_schedules: { ...plan.day_schedules, [day]: row } })
  }
  const toggleDay = (day: string) => {
    const on = plan.days.includes(day)
    onChange({
      ...plan,
      days: on ? plan.days.filter(d => d !== day) : DAYS_OF_WEEK.filter(d => d === day || plan.days.includes(d)),
      day_schedules: on ? plan.day_schedules : { ...plan.day_schedules, [day]: rowOf(day) },
    })
  }
  const visits = biweeklyVisitDates(plan)

  return (
    <div className="bg-white rounded-2xl border border-violet-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] overflow-hidden">
      <div className="bg-gradient-to-r from-violet-50/80 via-indigo-50/50 to-slate-50 p-3 border-b border-violet-200/70 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
            <CalendarRange size={14} className="stroke-[2.5]" />
          </div>
          <span className="text-[12.5px] font-extrabold text-slate-800">Bi-Weekly Schedule</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
            {plan.days.length} days · every other week
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50/80 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2 px-3 w-[14%]">Day</th>
              <th className="py-2 px-3 w-[19%]">Start</th>
              <th className="py-2 px-3 w-[19%]">End</th>
              <th className="py-2 px-3 w-[16%]"><span className="inline-flex items-center gap-1"><Clock size={11} />Duration</span></th>
              <th className="py-2 px-3 w-[32%]"><span className="inline-flex items-center gap-1"><Users size={11} />Cleaner</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[12px]">
            {DAYS_OF_WEEK.map(day => {
              const on = plan.days.includes(day)
              const row = rowOf(day)
              const field = `w-full h-8 px-2 text-[12px] border rounded-lg focus:outline-none ${on ? 'bg-white border-slate-200 focus:border-violet-500 text-slate-800' : 'bg-slate-100/60 border-slate-200/60 text-slate-400 cursor-not-allowed'}`
              return (
                <tr key={day} className={on ? 'bg-white' : 'bg-slate-50/40 opacity-60'}>
                  <td className="py-2 px-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={on} onChange={() => toggleDay(day)} className="w-4 h-4 rounded text-violet-600 cursor-pointer" />
                      <span className={`text-[12.5px] font-extrabold ${on ? 'text-slate-900' : 'text-slate-400'}`}>{DAY_SHORT[day]}</span>
                    </label>
                  </td>
                  <td className="py-2 px-3"><input type="time" value={row.startTime} disabled={!on} onChange={e => setRow(day, { startTime: e.target.value })} className={`${field} font-mono`} /></td>
                  <td className="py-2 px-3"><input type="time" value={row.endTime} disabled={!on} onChange={e => setRow(day, { endTime: e.target.value })} className={`${field} font-mono`} /></td>
                  <td className="py-2 px-3">
                    <select value={row.duration} disabled={!on} onChange={e => setRow(day, { duration: Number(e.target.value) })} className={`${field} font-extrabold cursor-pointer`}>
                      {Array.from(new Set([2, 3, 4, 5, row.duration].filter(n => n > 0))).sort((a, b) => a - b).map(n => <option key={n} value={n}>{n} Hours</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <select value={row.cleaner} disabled={!on} onChange={e => setRow(day, { cleaner: e.target.value })} className={`${field} cursor-pointer`}>
                      <option value="">Unassigned</option>
                      {Array.from(new Set([...cleaners, row.cleaner].filter(Boolean))).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Contract: duration chips + calendar (UX-81) */}
      <div className="p-3 border-t border-violet-100 bg-violet-50/30 grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <div className="lg:col-span-8">
          <ContractCalendar plan={plan} onChange={onChange} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-2 text-[11.5px] text-violet-900 bg-white border border-violet-200 rounded-xl p-3">
          <div className="flex items-center gap-2 font-extrabold text-[12px]"><CalendarClock size={14} className="text-violet-600" />Contract</div>
          <div className="flex justify-between"><span className="text-slate-500">Start</span><b>{plan.start_date || '—'}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">End</span><b>{biweeklyEndDate(plan)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Duration</span><b>{plan.months} {plan.months === 1 ? 'month' : 'months'}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Visits</span><b>{visits.length}</b></div>
          {plan.days.length === 0 && <span className="text-amber-700">Tick the days the client wants.</span>}
        </div>
      </div>
    </div>
  )
}
