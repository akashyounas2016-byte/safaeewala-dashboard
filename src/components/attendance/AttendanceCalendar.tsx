import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { classifyAttendanceDay, type AttendanceOverride, type AttendanceStatus } from '@/lib/attendance'
import { employeeMatchesStaff, isBogusJob, splitStaffNames } from '@/lib/clientDataSync'
import type { DailyJob, Employee } from '@/types'
import { todayDubai, monthDubai } from '@/lib/dubaiTime'

const STATUS_STYLE: Record<AttendanceStatus, { cell: string; label: string }> = {
  present:   { cell: 'bg-emerald-500 text-white', label: 'Present' },
  available: { cell: 'bg-sky-100 text-sky-800', label: 'Available' },
  absent:    { cell: 'bg-rose-500 text-white', label: 'Absent' },
  on_leave:  { cell: 'bg-amber-400 text-white', label: 'On leave' },
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Month calendar per cleaner (present / available / absent / leave) and a monthly
 * summary export for all cleaners (UX-20). Uses the shared day rule (classifyAttendanceDay).
 */
export function AttendanceCalendar({ cleaners, employeeByName, dailyJobs, overrides }: {
  cleaners: string[]
  employeeByName: Map<string, Employee>
  dailyJobs: DailyJob[]
  overrides: Record<string, AttendanceOverride>
}) {
  const [month, setMonth] = useState(() => monthDubai())
  const [cleaner, setCleaner] = useState(cleaners[0] || '')

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const count = new Date(y, m, 0).getDate()
    return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`)
  }, [month])

  const jobsByDate = useMemo(() => {
    const map = new Map<string, DailyJob[]>()
    dailyJobs.forEach(j => {
      const d = (j.date || '').split('T')[0]
      if (!d.startsWith(month) || isBogusJob(j)) return
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(j)
    })
    return map
  }, [dailyJobs, month])

  const statusFor = (name: string, date: string) => {
    const key = name.trim().toLowerCase()
    const emp = employeeByName.get(key)
    const jobs = (jobsByDate.get(date) || []).filter(j => emp
      ? employeeMatchesStaff(emp, j.staff_name)
      : splitStaffNames(j.staff_name || '').some(n => n.trim().toLowerCase() === key))
    const override = (emp && overrides[`${date}_id:${emp.id}`]) || overrides[`${date}_${key}`]
    return classifyAttendanceDay(jobs, override)
  }

  const todayStr = todayDubai()
  const cells = cleaner ? days.map(d => ({ date: d, future: d > todayStr, ...statusFor(cleaner, d) })) : []
  const summary = cells.filter(c => !c.future).reduce((acc, c) => { acc[c.status]++; return acc },
    { present: 0, available: 0, absent: 0, on_leave: 0 } as Record<AttendanceStatus, number>)
  const firstWeekday = new Date(`${month}-01T00:00:00`).getDay()

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }

  const exportMonth = () => {
    const pastDays = days.filter(d => d <= todayStr)
    const rows = [['Cleaner', 'Present days', 'Available days', 'Absent days', 'Leave days', 'Duty hours', 'OT hours']]
    cleaners.forEach(name => {
      const t = { present: 0, available: 0, absent: 0, on_leave: 0, duty: 0, ot: 0 }
      pastDays.forEach(d => { const c = statusFor(name, d); t[c.status]++; t.duty += c.dutyHours; t.ot += c.otHours })
      rows.push([name, t.present, t.available, t.absent, t.on_leave, Math.round(t.duty * 10) / 10, Math.round(t.ot * 10) / 10].map(String))
    })
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `attendance-summary-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><CalendarDays size={16} className="text-teal-600" /> Monthly attendance</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={cleaner} onChange={e => setCleaner(e.target.value)}
            className="px-3 py-1.5 text-[12.5px] border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 font-semibold max-w-[200px]">
            {cleaners.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer" title="Previous month"><ChevronLeft size={14} /></button>
          <span className="text-[12.5px] font-bold text-slate-700 w-[110px] text-center">
            {new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer" title="Next month"><ChevronRight size={14} /></button>
          <button type="button" onClick={exportMonth} className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 cursor-pointer">
            <Download size={13} /> Export month
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(Object.keys(STATUS_STYLE) as AttendanceStatus[]).map(st => (
          <span key={st} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${STATUS_STYLE[st].cell}`}>
            {STATUS_STYLE[st].label}: {summary[st]}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1.5 min-w-[420px]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[10.5px] font-bold text-slate-400 uppercase">{d}</div>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
          {cells.map(c => (
            <div
              key={c.date}
              className={`rounded-lg p-1.5 h-[52px] text-[11px] flex flex-col justify-between ${c.future ? 'bg-slate-50 text-slate-300' : STATUS_STYLE[c.status].cell}`}
              title={c.future ? c.date : `${c.date}: ${STATUS_STYLE[c.status].label}${c.dutyHours ? ` · ${c.dutyHours}h` : ''}${c.absenceReason ? ` · ${c.absenceReason}` : ''}`}
            >
              <span className="font-bold">{Number(c.date.slice(8))}</span>
              {!c.future && c.dutyHours > 0 && <span className="text-[10px] opacity-90">{c.dutyHours}h</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
