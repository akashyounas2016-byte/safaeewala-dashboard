import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

const KEY = 'safaeewala_overview_folded'

/**
 * R-OPS-17: Overview widgets (Reports, Live Activity, Live Map) can be folded to their header line.
 * The choice is kept on this device, per widget.
 */
export function useFolded(id: string, defaultFolded = false): [boolean, () => void] {
  // R-OPS-26: some widgets start folded until the person opens them (then their choice is kept)
  const [folded, setFolded] = useState(() => { const v = safeLocalStorageGet<Record<string, boolean>>(KEY, {})[id]; return v === undefined ? defaultFolded : Boolean(v) })
  const toggle = () => setFolded(prev => {
    const next = !prev
    safeLocalStorageSet(KEY, { ...safeLocalStorageGet<Record<string, boolean>>(KEY, {}), [id]: next })
    return next
  })
  return [folded, toggle]
}

/**
 * R-OPS-26: a group of Overview widgets that starts folded to one slim line ("Show"), so the page scrolls less.
 */
export function FoldSection({ id, title, note, children, defaultFolded = true }: { id: string; title: string; note?: string; children: React.ReactNode; defaultFolded?: boolean }) {
  const [folded, toggle] = useFolded(id, defaultFolded)
  return (
    <div className="mb-6">
      <div className={`flex items-center justify-between gap-3 ${folded ? 'bg-white rounded-[18px] border border-[#E4E8EC] shadow-xs px-5 py-3' : 'mb-2 px-1'}`}>
        <div className="min-w-0">
          <p className={`${folded ? 'text-[14.5px]' : 'text-[12px] uppercase tracking-wider text-slate-500'} font-bold text-[#111827] truncate`}>{title}</p>
          {folded && note && <p className="text-[12px] text-slate-500 truncate">{note}</p>}
        </div>
        <FoldButton folded={folded} onToggle={toggle} />
      </div>
      {!folded && children}
    </div>
  )
}

/** The Hide / Show chip in a widget header; `light` for a dark or coloured header */
export function FoldButton({ folded, onToggle, light = false }: { folded: boolean; onToggle: () => void; light?: boolean }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={!folded} title={folded ? 'Show this widget' : 'Hide this widget'}
      className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11.5px] font-bold cursor-pointer transition-colors shrink-0 ${
        light ? 'bg-white/10 hover:bg-white/20 border border-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
      {folded ? <><ChevronDown size={14} /> Show</> : <><ChevronUp size={14} /> Hide</>}
    </button>
  )
}
