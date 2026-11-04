import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, todayDubai } from '@/lib/dubaiTime'
import { biweeklyEndDate, biweeklyVisitDates, type BiWeeklyPlan } from '@/lib/biweekly'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DURATIONS = [1, 2, 3, 4, 6, 9, 12]

const ym = (date: string) => date.slice(0, 7)
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + by
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
/** Fewest whole months (1–60) whose contract reaches the chosen last day */
const monthsUntil = (start: string, last: string) => {
  for (let n = 1; n <= 60; n++) if (biweeklyEndDate({ start_date: start, months: n }) >= last) return n
  return 60
}

/**
 * R-CLI-02 / UX-81: visual picker for a Bi-Weekly contract — duration chips and a month calendar.
 * "Start" mode: click the first day. "End" mode: click the last day, the duration becomes the whole
 * months up to it. The contract range is shaded and every visit day is marked.
 */
export function ContractCalendar({ plan, onChange }: { plan: BiWeeklyPlan; onChange: (p: BiWeeklyPlan) => void }) {
  const [month, setMonth] = useState(() => ym(plan.start_date || todayDubai()))
  const [pick, setPick] = useState<'start' | 'end'>('start')
  const end = biweeklyEndDate(plan)
  const visits = new Set(biweeklyVisitDates(plan))
  const today = todayDubai()

  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // Monday first
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = [...Array(lead).fill(''), ...Array.from({ length: daysIn }, (_, i) => addDays(first, i))]

  const choose = (date: string) => {
    if (pick === 'start') { onChange({ ...plan, start_date: date }); setPick('end') }
    else if (date > plan.start_date) onChange({ ...plan, months: monthsUntil(plan.start_date, date) })
    else { onChange({ ...plan, start_date: date }); setPick('end') }
  }

  return (
    <div className="space-y-2.5">
      {/* Duration chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mr-1">Duration</span>
        {DURATIONS.map(n => (
          <button key={n} type="button" onClick={() => onChange({ ...plan, months: n })}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold border cursor-pointer ${plan.months === n ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300'}`}>
            {n} {n === 1 ? 'month' : 'months'}
          </button>
        ))}
        {!DURATIONS.includes(plan.months) && (
          <span className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-violet-600 text-white">{plan.months} months</span>
        )}
      </div>

      <div className="bg-white border border-violet-200 rounded-xl p-2.5 select-none">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer" title="Previous month"><ChevronLeft size={15} /></button>
          <span className="text-[12.5px] font-extrabold text-slate-800">{MONTH_NAMES[m - 1]} {y}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer" title="Next month"><ChevronRight size={15} /></button>
        </div>
        <div className="flex items-center gap-1 mb-2">
          {(['start', 'end'] as const).map(p => (
            <button key={p} type="button" onClick={() => setPick(p)}
              className={`flex-1 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${pick === p ? 'bg-violet-50 text-violet-800 border-violet-400' : 'bg-white text-slate-500 border-slate-200'}`}>
              {p === 'start' ? `Start: ${plan.start_date || '—'}` : `End: ${end}`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-slate-400 mb-1">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />
            const inRange = d >= plan.start_date && d <= end
            const isEdge = d === plan.start_date || d === end
            const visit = visits.has(d)
            return (
              <button key={d} type="button" onClick={() => choose(d)} title={visit ? `Visit · ${d}` : d}
                className={`relative h-8 rounded-lg text-[11.5px] font-semibold cursor-pointer transition-colors ${
                  isEdge ? 'bg-violet-600 text-white'
                    : inRange ? 'bg-violet-100 text-violet-900 hover:bg-violet-200'
                    : 'text-slate-700 hover:bg-slate-100'
                } ${d === today ? 'ring-1 ring-emerald-500' : ''}`}>
                {Number(d.slice(8))}
                {visit && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${isEdge ? 'bg-white' : 'bg-emerald-600'}`} />}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-slate-500">
          {pick === 'start' ? 'Click the first day of service.' : 'Click the last day — the duration becomes the months up to it.'} Green dot = visit day.
        </p>
      </div>
    </div>
  )
}
