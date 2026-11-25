import { useState } from 'react'
import { LayoutGrid, ArrowUp, ArrowDown, Eye, EyeOff, RotateCcw, GripVertical } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

/**
 * R-OPS-23: Overview → "Cards" next to the date filter: show / hide each card and change their order.
 * Saved on this computer (per browser), so the screen opens the same way next time.
 */
export interface CardPrefs { order: string[]; hidden: string[] }
const KEY = 'safaeewala_overview_cards'

/** The saved order (new cards added at the end, removed ones dropped) and the hidden list */
export function useCardPrefs(defaultIds: string[]): [CardPrefs, (p: CardPrefs) => void] {
  const fix = (p: Partial<CardPrefs> | null): CardPrefs => {
    const saved = (p?.order || []).filter(id => defaultIds.includes(id))
    return { order: [...saved, ...defaultIds.filter(id => !saved.includes(id))], hidden: (p?.hidden || []).filter(id => defaultIds.includes(id)) }
  }
  const [prefs, setPrefs] = useState<CardPrefs>(() => fix(safeLocalStorageGet<CardPrefs | null>(KEY, null)))
  const save = (p: CardPrefs) => { const f = fix(p); setPrefs(f); safeLocalStorageSet(KEY, f) }
  return [prefs, save]
}

export function CardsCustomizer({ cards, prefs, onChange }: {
  cards: { id: string; label: string }[]
  prefs: CardPrefs
  onChange: (p: CardPrefs) => void
}) {
  const [open, setOpen] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const labelOf = (id: string) => cards.find(c => c.id === id)?.label || id
  const shownCount = prefs.order.filter(id => !prefs.hidden.includes(id)).length
  const move = (from: number, to: number) => {
    if (to < 0 || to >= prefs.order.length || from === to) return
    const order = [...prefs.order]
    const [x] = order.splice(from, 1)
    order.splice(to, 0, x)
    onChange({ ...prefs, order })
  }
  const toggle = (id: string) => onChange({ ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter(x => x !== id) : [...prefs.hidden, id] })
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Cards — show, hide and order the cards" title="Show, hide and order the cards"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer">
        <LayoutGrid size={14} /> Cards <span className="text-emerald-600/80">{shownCount}/{prefs.order.length}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Overview cards" size="md">
        <p className="text-[12.5px] text-slate-500 mb-3">Tick the cards to show. Drag a row, or use the arrows, to change the order. Saved on this computer.</p>
        <ul className="space-y-1.5" aria-label="Cards">
          {prefs.order.map((id, i) => {
            const hidden = prefs.hidden.includes(id)
            return (
              <li key={id} draggable onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null) }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${drag === i ? 'border-emerald-400 bg-emerald-50' : hidden ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                <GripVertical size={15} className="text-slate-300 cursor-grab shrink-0" aria-hidden />
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <input type="checkbox" checked={!hidden} onChange={() => toggle(id)} className="accent-emerald-600 w-4 h-4" aria-label={`Show ${labelOf(id)}`} />
                  <span className={`text-[13px] font-semibold truncate ${hidden ? 'text-slate-400' : 'text-slate-800'}`}>{labelOf(id)}</span>
                </label>
                {hidden ? <EyeOff size={14} className="text-slate-300 shrink-0" /> : <Eye size={14} className="text-emerald-600 shrink-0" />}
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${labelOf(id)} up`} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center cursor-pointer"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === prefs.order.length - 1} aria-label={`Move ${labelOf(id)} down`} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center cursor-pointer"><ArrowDown size={13} /></button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 mt-4">
          <button type="button" onClick={() => onChange({ order: cards.map(c => c.id), hidden: [] })} className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-600 hover:text-emerald-700 cursor-pointer">
            <RotateCcw size={13} /> Reset to default
          </button>
          <button type="button" onClick={() => setOpen(false)} className="h-10 px-5 rounded-xl bg-[#0F1F19] text-white text-[13px] font-bold cursor-pointer">Done</button>
        </div>
      </Modal>
    </>
  )
}
