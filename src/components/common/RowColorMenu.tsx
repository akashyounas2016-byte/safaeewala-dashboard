import { Check, Palette } from 'lucide-react'
import { ROW_COLOR_PRESETS } from '@/components/dailyJobSheet/jobSheetUtils'

/**
 * UX-167: the one row-colour list of Add Job (Daily Job Sheet and Excel sheet) and New Booking. Each choice is
 * shown filled with its colour, the way the row will look, so the 40 colours can be told apart at a glance.
 * Opens upwards (it sits at the bottom of the popups).
 */
export function RowColorMenu({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const colours = ROW_COLOR_PRESETS.filter(p => p.id !== 'default')
  return (
    <div className="absolute z-50 right-0 bottom-full mb-1.5 w-full sm:w-[360px] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-1 duration-150 flex flex-col">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Palette size={12} className="text-slate-400" />
          Select Row Color ({colours.length})
        </span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onPick('default') }}
          className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer ${value === 'default' || !value ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          Default (no colour)
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto pr-1 grid grid-cols-2 gap-1.5 [scrollbar-width:thin]">
        {colours.map(preset => {
          const selected = value === preset.id
          return (
            <button
              type="button"
              key={preset.id}
              onClick={e => { e.stopPropagation(); onPick(preset.id) }}
              title={preset.label}
              style={{ backgroundColor: preset.circleColor }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold text-slate-900 text-left cursor-pointer transition-all ${selected ? 'ring-2 ring-offset-1 ring-slate-900 font-bold' : 'ring-1 ring-black/10 hover:ring-black/40'}`}
            >
              <span className="truncate flex-1">{preset.label}</span>
              {selected && <Check size={13} className="shrink-0 stroke-[3]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
