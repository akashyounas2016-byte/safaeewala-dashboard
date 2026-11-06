import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

/**
 * UX-108: show / hide and reorder a set of items (cards or table columns), remembered per browser.
 * Items added later appear at the end; unknown saved ids are ignored.
 */
export interface LayoutItem { id: string; label: string; locked?: boolean }
export interface LayoutState { order: string[]; hidden: string[] }

export function mergeLayout(items: LayoutItem[], saved: Partial<LayoutState> | null | undefined): LayoutState {
  const ids = items.map(i => i.id)
  const order = [...(saved?.order || []).filter(id => ids.includes(id)), ...ids.filter(id => !(saved?.order || []).includes(id))]
  const hidden = (saved?.hidden || []).filter(id => ids.includes(id) && !items.find(i => i.id === id)?.locked)
  return { order, hidden }
}

export function useLayout(storageKey: string, items: LayoutItem[]) {
  const [state, setState] = useState<LayoutState>(() => mergeLayout(items, safeLocalStorageGet<Partial<LayoutState> | null>(storageKey, null)))
  const save = (next: LayoutState) => { setState(next); safeLocalStorageSet(storageKey, next) }
  const visible = state.order.filter(id => !state.hidden.includes(id))
  return {
    state,
    visible,
    toggle: (id: string) => save({ ...state, hidden: state.hidden.includes(id) ? state.hidden.filter(h => h !== id) : [...state.hidden, id] }),
    move: (id: string, dir: -1 | 1) => {
      const i = state.order.indexOf(id), j = i + dir
      if (i < 0 || j < 0 || j >= state.order.length) return
      const order = [...state.order];[order[i], order[j]] = [order[j], order[i]]
      save({ ...state, order })
    },
    reset: () => save({ order: items.map(i => i.id), hidden: [] }),
  }
}

type Layout = ReturnType<typeof useLayout>

function Section({ title, items, layout }: { title: string; items: LayoutItem[]; layout: Layout }) {
  const byId = new Map(items.map(i => [i.id, i]))
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">{title}</p>
        <button type="button" onClick={layout.reset} className="text-[10.5px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"><RotateCcw size={11} />Reset</button>
      </div>
      <ul className="space-y-0.5">
        {layout.state.order.map((id, idx) => {
          const item = byId.get(id); if (!item) return null
          const hidden = layout.state.hidden.includes(id)
          return (
            <li key={id} className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-slate-50">
              <button type="button" disabled={item.locked} onClick={() => layout.toggle(id)} aria-label={hidden ? `Show ${item.label}` : `Hide ${item.label}`}
                className={`w-6 h-6 rounded-md flex items-center justify-center ${item.locked ? 'text-slate-300' : hidden ? 'text-slate-400 hover:text-slate-700 cursor-pointer' : 'text-emerald-600 hover:text-emerald-800 cursor-pointer'}`}>
                {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <span className={`flex-1 text-[12.5px] ${hidden ? 'text-slate-400 line-through' : 'text-slate-800 font-semibold'}`}>{item.label}</span>
              <button type="button" onClick={() => layout.move(id, -1)} disabled={idx === 0} aria-label={`Move ${item.label} up`} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer"><ArrowUp size={12} /></button>
              <button type="button" onClick={() => layout.move(id, 1)} disabled={idx === layout.state.order.length - 1} aria-label={`Move ${item.label} down`} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer"><ArrowDown size={12} /></button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A "Customize" button with a popover of sections (e.g. Cards, Columns) */
export function LayoutCustomizer({ sections }: { sections: { title: string; items: LayoutItem[]; layout: Layout }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // fixed on screen: a widget with overflow-hidden must not cut the list
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const openMenu = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    setOpen(v => !v)
  }
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={openMenu} aria-expanded={open}
        className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl border border-[#E2E5E0] bg-white hover:bg-slate-50 text-slate-800 cursor-pointer">
        <SlidersHorizontal size={13} /> Customize
      </button>
      {open && (
        <div style={pos ? { top: pos.top, right: pos.right, maxHeight: `calc(100vh - ${pos.top + 16}px)` } : undefined} className="fixed z-[90] w-[280px] overflow-y-auto bg-white rounded-2xl border border-[#E2E5E0] shadow-xl p-3 space-y-3">
          {sections.map(s => <Section key={s.title} {...s} />)}
        </div>
      )}
    </div>
  )
}
