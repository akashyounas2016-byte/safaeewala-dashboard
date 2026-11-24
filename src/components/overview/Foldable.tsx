import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'

const KEY = 'safaeewala_overview_folded'

/**
 * R-OPS-17: Overview widgets (Reports, Live Activity, Live Map) can be folded to their header line.
 * The choice is kept on this device, per widget.
 */
export function useFolded(id: string): [boolean, () => void] {
  const [folded, setFolded] = useState(() => Boolean(safeLocalStorageGet<Record<string, boolean>>(KEY, {})[id]))
  const toggle = () => setFolded(prev => {
    const next = !prev
    safeLocalStorageSet(KEY, { ...safeLocalStorageGet<Record<string, boolean>>(KEY, {}), [id]: next })
    return next
  })
  return [folded, toggle]
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
