import { useMemo, useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import type { DailyJob, Employee } from '@/types'
import type { AttendanceOverride } from '@/lib/attendance'
import { myMonth } from '@/lib/myMonth'
import { todayDubai, addDays } from '@/lib/dubaiTime'
import { fmtDate } from '@/components/dailyJobSheet/jobSheetUtils'

/** R-ATT-13: "My month" — days worked, jobs, hours, OT, leave and absences, this month or last month, day by day */
export function MyMonthCard({ emp, jobs, marks }: { emp: Employee; jobs: DailyJob[]; marks: Record<string, AttendanceOverride> }) {
  const today = todayDubai()
  const thisMonth = today.slice(0, 7)
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [open, setOpen] = useState(false)
  const m = useMemo(() => myMonth(emp, jobs, marks, month), [emp, jobs, marks, month])
  const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const tiles: [string, string][] = [
    ['Days worked', String(m.workDays)], ['Jobs', String(m.jobs)], ['Duty hours', `${m.hours}h`], ['Overtime', `${m.ot}h`],
    ['Leave days', String(m.leaveDays)], ['Half / short', `${m.halfDays} / ${m.shortLeaves}`], ['Absent', String(m.absentDays)],
  ]
  return (
    <section aria-label="My month" className="bg-white rounded-2xl border border-[#E4E8EC] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[15px] font-black text-[#111827] flex items-center gap-2"><BarChart3 size={17} className="text-emerald-700" /> My month</p>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1" role="group" aria-label="Month">
          {[thisMonth, lastMonth].map(ym => (
            <button key={ym} type="button" onClick={() => setMonth(ym)} aria-pressed={month === ym}
              className={`px-3 h-8 rounded-lg text-[12px] font-bold cursor-pointer ${month === ym ? 'bg-white text-[#111827] shadow-xs' : 'text-slate-500'}`}>{label(ym)}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {tiles.map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2">
            <p className="text-[16px] font-black text-[#111827] tabular-nums">{v}</p>
            <p className="text-[11px] font-semibold text-slate-500">{l}</p>
          </div>
        ))}
      </div>
      {m.days.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="text-[12.5px] font-bold text-emerald-700 flex items-center gap-1 cursor-pointer">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Day by day ({m.days.length})
          </button>
          {open && (
            <ul className="divide-y divide-slate-100">
              {m.days.map(d => (
                <li key={d.date} className="py-2 flex items-center gap-2 text-[13px]">
                  <span className="font-bold text-slate-800 w-[112px] shrink-0">{fmtDate(d.date)}</span>
                  <span className="flex-1 min-w-0 text-slate-600 truncate">
                    {d.jobs > 0 ? `${d.jobs} job${d.jobs === 1 ? '' : 's'} · ${d.hours}h${d.ot > 0 ? ` · OT ${d.ot}h` : ''}` : ''}
                    {d.mark ? `${d.jobs > 0 ? ' · ' : ''}${d.mark.status === 'absent' ? 'Absent' : d.mark.status === 'on_leave' ? `${d.mark.category || 'Leave'}${d.mark.approval === 'pending' ? ' (waiting)' : ''}` : ''}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-[11px] text-slate-400">From the Daily Job Sheet and Attendance. Ask the office if something is missing.</p>
    </section>
  )
}
