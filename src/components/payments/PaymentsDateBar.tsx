import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { PAYMENTS_MORE_PRESETS, PAYMENTS_QUICK_PRESETS, type PaymentsRange, type PaymentsRangePreset } from '@/lib/paymentsRange'

/**
 * R-FIN-21: the one date filter of the Payments screen (under the header). Quick pills, a "More" list
 * (3 / 6 / 12 months, this / last year, all time, custom) and From / To when Custom is picked.
 */
export function PaymentsDateBar({ range, from, to, onPreset, onCustom, note }: {
  range: PaymentsRange
  from: string
  to: string
  onPreset: (p: PaymentsRangePreset) => void
  onCustom: (from: string, to: string) => void
  note?: string
}) {
  const [open, setOpen] = useState(false)
  const moreActive = PAYMENTS_MORE_PRESETS.some(p => p.id === range.preset)
  const pill = (active: boolean) => `px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${active ? 'bg-[#0F1F19] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'}`
  return (
    <section aria-label="Date range" className="bg-white rounded-[20px] border border-[#E4E8EC] shadow-xs px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0"><Calendar size={17} /></span>
        <div className="min-w-0">
          <p className="text-[14.5px] font-extrabold text-[#111827] leading-tight">{range.label}</p>
          <p className="text-[11.5px] text-slate-500 leading-tight truncate">{range.sub}{note ? ` · ${note}` : ''}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-[#f8fafc] p-1 rounded-xl border border-[#E4E8EC] flex-wrap" role="group" aria-label="Quick ranges">
          {PAYMENTS_QUICK_PRESETS.map(p => (
            <button key={p.id} type="button" aria-pressed={range.preset === p.id} onClick={() => onPreset(p.id)} className={pill(range.preset === p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="relative">
          <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border cursor-pointer ${moreActive ? 'bg-[#0F1F19] text-white border-[#0F1F19]' : 'bg-[#f8fafc] hover:bg-slate-100 border-[#E4E8EC] text-slate-700'}`}>
            {moreActive ? PAYMENTS_MORE_PRESETS.find(p => p.id === range.preset)?.label.replace('…', '') : 'More'} <ChevronDown size={14} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#E4E8EC] rounded-2xl shadow-xl z-50 p-1.5">
                {PAYMENTS_MORE_PRESETS.map(p => (
                  <button key={p.id} type="button" onClick={() => { onPreset(p.id); setOpen(false) }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-[12.5px] font-semibold cursor-pointer ${range.preset === p.id ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}>{p.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        {range.preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" aria-label="From" value={from} onChange={e => onCustom(e.target.value, to)} className="text-[12px] px-2.5 py-1.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500" />
            <span className="text-[11px] font-bold text-slate-400">to</span>
            <input type="date" aria-label="To" value={to} onChange={e => onCustom(from, e.target.value)} className="text-[12px] px-2.5 py-1.5 bg-white border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-500" />
          </div>
        )}
      </div>
    </section>
  )
}
