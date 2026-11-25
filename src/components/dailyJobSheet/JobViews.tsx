import { Clock, MapPin, Users, Wallet, CalendarDays } from 'lucide-react'
import type { DailyJob } from '@/types'
import { jobProgressByTime, dubaiMinutes, type JobProgress } from '@/lib/overviewStats'
import { todayDubai } from '@/lib/dubaiTime'
import { cleanNum, formatTime12h, fmtDate, parseTimeToMinutes } from '@/components/dailyJobSheet/jobSheetUtils'
import { cleanClientNameFromAddress, isBogusJob } from '@/lib/clientDataSync'

/**
 * R-SHEET-07: the Bookings views on the Daily Job Sheet — Cards, Board (Scheduled / Live / Done) and Calendar
 * (one column per day). Table stays the sheet's own table. Click a job to edit it (same pop-up as the table).
 */
export type JobSheetView = 'table' | 'cards' | 'board' | 'calendar'
export const JOB_SHEET_VIEWS: { key: JobSheetView; label: string }[] = [
  { key: 'table', label: 'Table' }, { key: 'cards', label: 'Cards' }, { key: 'board', label: 'Board' }, { key: 'calendar', label: 'Calendar' },
]

const STATUS: Record<JobProgress, { label: string; cls: string; dot: string }> = {
  confirmed: { label: 'Scheduled', cls: 'bg-teal-50 text-teal-800 border-teal-200', dot: 'bg-teal-500' },
  in_progress: { label: 'Live', cls: 'bg-cyan-50 text-cyan-800 border-cyan-200', dot: 'bg-cyan-500' },
  completed: { label: 'Done', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
}
const byTime = (a: DailyJob, b: DailyJob) => (a.date || '').localeCompare(b.date || '') || ((parseTimeToMinutes(a.start_time) ?? 9999) - (parseTimeToMinutes(b.start_time) ?? 9999))
const t12 = (t?: string) => { const f = formatTime12h(t); return f === '—' ? '' : f }

function JobCard({ job, st, compact, onOpen }: { job: DailyJob; st: JobProgress; compact?: boolean; onOpen: (j: DailyJob) => void }) {
  const s = STATUS[st]
  const charges = cleanNum(job.charges)
  return (
    <button type="button" onClick={() => onOpen(job)}
      className={`w-full text-left bg-white rounded-xl border border-[#E4E8EC] hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer ${compact ? 'p-2.5' : 'p-3.5'} min-w-0`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-black text-[#111827] flex items-center gap-1 tabular-nums"><Clock size={12} className="text-emerald-700" />{t12(job.start_time) || '—'}{job.end_time ? ` – ${t12(job.end_time)}` : ''}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
      </div>
      <p className={`font-bold text-[#111827] truncate ${compact ? 'text-[12px] mt-1' : 'text-[13.5px] mt-1.5'}`} title={job.address || ''}>{cleanClientNameFromAddress(job.address || job.area || 'Job')}</p>
      {!compact && job.area && <p className="text-[11.5px] text-slate-500 flex items-center gap-1 truncate"><MapPin size={11} />{job.area}</p>}
      <p className="text-[11.5px] text-slate-600 flex items-center gap-1 truncate mt-0.5" title={job.staff_name || ''}><Users size={11} className="shrink-0" />{job.staff_name || 'No cleaner'}</p>
      {!compact && (
        <p className="text-[11.5px] text-slate-600 flex items-center gap-1 mt-0.5"><Wallet size={11} />{charges > 0 ? `AED ${charges.toLocaleString()}` : '—'}{job.payment_mode ? ` · ${job.payment_mode}` : ''}</p>
      )}
    </button>
  )
}

export function JobViews({ jobs, view, onOpen }: { jobs: DailyJob[]; view: Exclude<JobSheetView, 'table'>; onOpen: (j: DailyJob) => void }) {
  const today = todayDubai(), nowMin = dubaiMinutes()
  const list = jobs.filter(j => !isBogusJob(j)).sort(byTime).map(j => ({ j, st: jobProgressByTime(j, today, nowMin) }))
  if (list.length === 0) return <div className="py-16 text-center text-[13px] text-slate-400">No jobs for these dates</div>

  if (view === 'cards') {
    return (
      <div className="p-4 sm:p-5 bg-slate-50/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map(({ j, st }) => <JobCard key={j.id} job={j} st={st} onOpen={onOpen} />)}
      </div>
    )
  }
  if (view === 'board') {
    const cols: JobProgress[] = ['confirmed', 'in_progress', 'completed']
    return (
      <div className="p-4 sm:p-5 bg-slate-50/60 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {cols.map(c => {
          const items = list.filter(x => x.st === c)
          return (
            <section key={c} className="bg-slate-100/70 rounded-2xl p-2.5 min-w-0" aria-label={STATUS[c].label}>
              <h4 className="flex items-center gap-2 px-1.5 pb-2 text-[12.5px] font-bold text-slate-700">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS[c].dot}`} />{STATUS[c].label}
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200">{items.length}</span>
              </h4>
              <div className="space-y-2 max-h-[640px] overflow-y-auto">
                {items.length ? items.map(({ j }) => <JobCard key={j.id} job={j} st={c} compact onOpen={onOpen} />) : <p className="text-[11.5px] text-slate-400 text-center py-6">None</p>}
              </div>
            </section>
          )
        })}
      </div>
    )
  }
  // calendar: one column per day of the open dates
  const days = [...new Set(list.map(x => x.j.date))].sort()
  return (
    <div className="p-4 sm:p-5 bg-slate-50/60 overflow-x-auto">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, minmax(190px, 1fr))` }}>
        {days.map(d => {
          const items = list.filter(x => x.j.date === d)
          return (
            <section key={d} className={`rounded-2xl p-2 min-w-0 ${d === today ? 'bg-emerald-50 ring-2 ring-emerald-300' : 'bg-white border border-[#E4E8EC]'}`} aria-label={d}>
              <h4 className="flex items-center gap-1.5 px-1 pb-2 text-[12px] font-bold text-slate-700">
                <CalendarDays size={13} className="text-emerald-700" />{fmtDate(d)}
                <span className="ml-auto text-[10.5px] px-1.5 py-0.5 rounded-full bg-slate-100">{items.length}</span>
              </h4>
              <div className="space-y-1.5">{items.map(({ j, st }) => <JobCard key={j.id} job={j} st={st} compact onOpen={onOpen} />)}</div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
