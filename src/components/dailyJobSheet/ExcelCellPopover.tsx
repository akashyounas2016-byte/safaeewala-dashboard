import { useEffect, useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Search } from 'lucide-react'

/**
 * One dropdown shell for every Excel Job Sheet cell (Address design — UX-35).
 *
 * Why a portal: the grid rows use a hover brightness filter, which turns each row into its own
 * layer. A dropdown drawn inside a row was painted under the next rows whenever the mouse moved
 * over them — the flicker. Rendered in document.body with a fixed position next to the cell, the
 * dropdown is above everything and does not move while the mouse travels over it.
 *
 * It opens next to the element it is rendered in (the cell editor). That element is found through a
 * hidden marker: a ref on the parent is not attached yet when this component's layout effect runs, which
 * left the dropdown invisible on first open.
 */
export function ExcelCellPopover({ width = 400, title, icon: Icon, search, banner, children, footer, listMaxHeight = 260 }: {
  width?: number
  title: string
  icon: ElementType
  search?: { value: string; onChange: (v: string) => void; placeholder: string }
  banner?: ReactNode
  children: ReactNode
  footer?: ReactNode
  listMaxHeight?: number
}) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const markerRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    let frame = 0
    const place = () => {
      const el = markerRef.current?.parentElement
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight
      const below = vh - r.bottom
      const openUp = below < 320 && r.top > below
      const left = Math.max(8, Math.min(r.left, vw - width - 8))
      const next = openUp ? { left, bottom: vh - r.top + 6 } : { left, top: r.bottom + 6 }
      setPos(p => (p && p.left === next.left && p.top === next.top && p.bottom === next.bottom ? p : next))
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place) }
    place()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [width])

  return <>
    <span ref={markerRef} hidden />
    {createPortal(
    <div
      // Keep the cell's input focused while choosing — except for inputs inside the dropdown
      onMouseDown={e => {
        const t = e.target as HTMLElement
        if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') e.preventDefault()
        e.stopPropagation()
      }}
      onClick={e => e.stopPropagation()}
      // Portal events still bubble through the React tree — the rows below must not react to them
      onMouseMove={e => e.stopPropagation()}
      onMouseOver={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 10000, width, left: pos?.left ?? -9999,
        top: pos?.top, bottom: pos?.bottom, visibility: pos ? 'visible' : 'hidden',
      }}
      className="bg-white border border-slate-200 rounded-xl shadow-2xl p-2.5 text-slate-800 text-[12px] select-none flex flex-col"
    >
      <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-2 flex items-center justify-between">
        <span>{title}</span>
        <Icon size={12} className="text-slate-400" />
      </div>
      {search && (
        <div className="relative mb-2 shrink-0">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="w-full text-[12.5px] pl-8 pr-7 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-emerald-500 focus:bg-white font-medium"
          />
          {search.value && (
            <button type="button" onMouseDown={e => { e.preventDefault(); search.onChange('') }}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 text-[11px] cursor-pointer" title="Clear search">✕</button>
          )}
        </div>
      )}
      {banner}
      <div className="relative overflow-y-auto flex-1 divide-y divide-slate-100 pr-0.5" style={{ maxHeight: listMaxHeight }}>
        {children}
      </div>
      {footer}
    </div>,
    document.body,
  )}
  </>
}

/** One row of a cell dropdown — same look in every column */
export function ExcelPopoverItem({ selected, onPick, icon: Icon, label, sub, mono, action }: {
  selected: boolean
  onPick: () => void
  icon?: ElementType
  label: ReactNode
  sub?: ReactNode
  mono?: boolean
  action?: ReactNode
}) {
  // The current value is scrolled into view when the full list opens
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current, list = el?.parentElement
    if (selected && el && list) list.scrollTop = Math.max(0, el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2)
  }, [selected])
  return (
    <div
      ref={ref}
      onMouseDown={e => { e.preventDefault(); onPick() }}
      className={`px-3 py-2 rounded-lg cursor-pointer text-left flex items-center justify-between group/popitem ${
        selected ? 'bg-emerald-50/80 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
      }`}
    >
      <div className="min-w-0 pr-2 flex-1">
        <div className={`text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5 truncate ${mono ? 'font-mono' : ''}`}>
          {Icon && <Icon size={13} className={selected ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />}
          <span className="truncate">{label}</span>
        </div>
        {sub && <div className="text-[11px] text-slate-500 truncate mt-0.5">{sub}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {selected && <Check size={14} className="text-emerald-600 stroke-[3] shrink-0" />}
        {action}
      </div>
    </div>
  )
}

/** The green "use what I typed" row shown above the list */
export function ExcelPopoverCustom({ onPick, icon: Icon, children, badge }: { onPick: () => void; icon: ElementType; children: ReactNode; badge?: string }) {
  return (
    <div
      onMouseDown={e => { e.preventDefault(); onPick() }}
      className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[12px] font-bold flex items-center justify-between cursor-pointer mb-2 shrink-0 border border-emerald-200 shadow-2xs"
    >
      <div className="flex items-center gap-2 truncate">
        <Icon size={14} className="text-emerald-700 stroke-[2.5] shrink-0" />
        <span className="truncate">{children}</span>
      </div>
      {badge && <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-600 text-white shrink-0 ml-2">{badge}</span>}
    </div>
  )
}

export function ExcelPopoverEmpty({ children }: { children: ReactNode }) {
  return <div className="py-4 text-center text-[12px] text-slate-400">{children}</div>
}
