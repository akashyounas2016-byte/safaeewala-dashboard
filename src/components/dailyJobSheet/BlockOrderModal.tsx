import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/**
 * UX-182: the order of the cleaner blocks on the Excel Job Sheet. Drag a cleaner, or use the arrows; Save keeps
 * the order for every day and every user. Cleaners added later come after the list, A→Z. "A→Z" clears the order.
 */
export function BlockOrderModal({ names, labelOf, order, onClose, onSave }: {
  names: string[]
  labelOf: (name: string) => string
  order: Record<string, number>
  onClose: () => void
  onSave: (order: Record<string, number>) => void
}) {
  const pos = (n: string) => { const p = order[n.toLowerCase()]; return Number.isFinite(p) ? p : 1e9 }
  const [list, setList] = useState(() => [...names].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b)))
  const [drag, setDrag] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return
    setList(l => { const next = [...l]; const [x] = next.splice(from, 1); next.splice(to, 0, x); return next })
  }

  return (
    <Modal open onClose={onClose} title="Cleaner block order" size="md"
      headerActions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onSave({})} title="Clear the order: blocks by name">
            <RotateCcw size={13} /> A→Z
          </Button>
          <Button type="button" size="sm" onClick={() => onSave(Object.fromEntries(list.map((n, i) => [n.toLowerCase(), i])))}>Save</Button>
        </div>
      }
    >
      <p className="text-[12px] text-slate-500 mb-3">Drag a cleaner or use the arrows. The order stays for every day and every user; a new job does not move it. New cleaners come after this list.</p>
      <ol className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
        {list.map((n, i) => (
          <li key={n}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i) } }}
            onDragEnd={() => setDrag(null)}
            className={`flex items-center gap-2 px-3 py-2 text-[13px] bg-white ${drag === i ? 'opacity-60 bg-teal-50' : ''}`}
          >
            <GripVertical size={14} className="text-slate-400 cursor-grab shrink-0" />
            <span className="w-6 text-right text-[11px] font-bold text-slate-400">{i + 1}</span>
            <span className="flex-1 font-semibold text-slate-800 truncate" title={n}>{labelOf(n)}</span>
            <button type="button" aria-label={`Move ${n} up`} disabled={i === 0} onClick={() => move(i, i - 1)}
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ArrowUp size={14} /></button>
            <button type="button" aria-label={`Move ${n} down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ArrowDown size={14} /></button>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
