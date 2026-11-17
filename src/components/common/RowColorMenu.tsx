import { Check, Palette } from 'lucide-react'
import { ROW_COLOR_PRESETS } from '@/components/dailyJobSheet/jobSheetUtils'
import { splitStaffNames } from '@/lib/clientDataSync'
import { notify } from '@/lib/notify'
import type { DailyJob } from '@/types'

/**
 * UX-169: a row colour already on another cleaner's row that day → that cleaner's name (colour id → name).
 * The cleaners of this job and rows at the same address (one team project, UX-71) do not count.
 */
export function rowColoursInUse(jobs: Pick<DailyJob, 'id' | 'date' | 'row_color' | 'staff_name' | 'address'>[], date: string, staff: string[], address = '', ownId?: string): Record<string, string> {
  const mine = new Set(staff.map(s => s.trim().toLowerCase()).filter(Boolean))
  const addr = address.trim().toLowerCase()
  const used: Record<string, string> = {}
  jobs.forEach(j => {
    const c = String(j.row_color || '').trim()
    if (!c || c === 'default' || j.date !== date || (ownId && j.id === ownId)) return
    if (addr && (j.address || '').trim().toLowerCase() === addr) return
    const names = splitStaffNames(j.staff_name || '').filter(n => !mine.has(n.trim().toLowerCase()))
    if (names.length && !used[c]) used[c] = names.join(', ')
  })
  return used
}

/**
 * UX-167 / UX-169: the one row-colour picker of Add Job (Daily Job Sheet and Excel sheet) and New Booking —
 * 40 light colours as swatches, no names. A colour already given to another cleaner that day is marked and
 * cannot be picked (a warning says who has it). Opens upwards (it sits at the bottom of the popups).
 */
export function RowColorMenu({ value, onPick, usedBy = {} }: { value: string; onPick: (id: string) => void; usedBy?: Record<string, string> }) {
  const colours = ROW_COLOR_PRESETS.filter(p => p.id !== 'default')
  const pick = (id: string) => {
    if (usedBy[id]) { notify.warning(`This colour is already on ${usedBy[id]}'s row today — pick another colour.`); return }
    onPick(id)
  }
  return (
    <div className="absolute z-50 right-0 bottom-full mb-1.5 w-full sm:w-[340px] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-1 duration-150 flex flex-col">
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Palette size={12} className="text-slate-400" />
          Row Color
        </span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onPick('default') }}
          className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer ${value === 'default' || !value ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          No colour
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {colours.map(preset => {
          const selected = value === preset.id
          const taken = usedBy[preset.id]
          return (
            <button
              type="button"
              key={preset.id}
              onClick={e => { e.stopPropagation(); pick(preset.id) }}
              title={taken ? `Used today by ${taken}` : undefined}
              aria-label={taken ? `Colour used today by ${taken}` : `Colour ${preset.label}`}
              aria-pressed={selected}
              style={{ backgroundColor: preset.circleColor }}
              className={`relative h-8 rounded-lg flex items-center justify-center transition-all ${taken ? 'cursor-not-allowed ring-1 ring-black/10' : 'cursor-pointer hover:scale-110'} ${selected ? 'ring-2 ring-offset-1 ring-slate-900' : taken ? '' : 'ring-1 ring-black/10 hover:ring-black/40'}`}
            >
              {selected && <Check size={14} className="text-slate-900 stroke-[3]" />}
              {taken && !selected && <span className="absolute inset-0 rounded-lg bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(15,23,42,0.18)_4px,rgba(15,23,42,0.18)_6px)]" />}
            </button>
          )
        })}
      </div>
      {Object.keys(usedBy).length > 0 && <p className="text-[10.5px] text-slate-500 mt-2">Striped = already used today by another cleaner.</p>}
    </div>
  )
}
