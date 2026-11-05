import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag } from 'lucide-react'
import { worstFlag, type JobFlag } from '@/lib/jobFlags'
import { formatTime12h } from '@/components/dailyJobSheet/jobSheetUtils'

const COLOR = {
  clash: { icon: 'text-rose-600 fill-rose-500', head: 'bg-rose-50 text-rose-800 border-rose-200' },
  open: { icon: 'text-amber-600 fill-amber-400', head: 'bg-amber-50 text-amber-800 border-amber-200' },
  history: { icon: 'text-slate-400 fill-slate-300', head: 'bg-slate-50 text-slate-700 border-slate-200' },
} as const

/**
 * UX-86: a flag next to the cleaner's name. Hovering shows each issue (time, site, why); a sync note
 * can be cleared from the popup.
 */
export function JobFlagIcon({ flags, onClear }: { flags: JobFlag[]; onClear: (flag: JobFlag) => void }) {
  const level = worstFlag(flags)
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  if (!level) return null

  const open = () => {
    window.clearTimeout(closeTimer.current)
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = 340
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: Math.min(r.bottom + 6, window.innerHeight - 260) })
  }
  const close = () => { closeTimer.current = window.setTimeout(() => setPos(null), 180) }

  return (
    <>
      <button ref={btnRef} type="button" onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
        onClick={e => { e.stopPropagation(); if (pos) setPos(null); else open() }}
        aria-label={`${flags.length} issue${flags.length === 1 ? '' : 's'}`}
        className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-black/5 cursor-pointer shrink-0">
        <Flag size={13} className={COLOR[level].icon} />
      </button>
      {pos && createPortal(
        <div onMouseEnter={open} onMouseLeave={close} style={{ position: 'fixed', left: pos.left, top: pos.top, width: 340 }}
          className="z-[300] bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 space-y-2 text-left text-[12px] text-slate-700 font-normal whitespace-normal">
          {flags.map((f, i) => (
            <div key={i} className={`rounded-lg border px-2.5 py-2 ${COLOR[f.level].head}`}>
              <p className="font-bold flex items-center gap-1.5"><Flag size={12} className={COLOR[f.level].icon} />{f.title}</p>
              <p className="text-[11px] opacity-80 mt-0.5">
                {[f.row.start_time && `${formatTime12h(f.row.start_time)}–${formatTime12h(f.row.end_time)}`, f.row.address].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 leading-snug">{f.detail}</p>
              {f.clearable && (
                <button type="button" onClick={e => { e.stopPropagation(); onClear(f); setPos(null) }}
                  className="mt-1.5 px-2 py-0.5 rounded-md bg-white border border-current text-[11px] font-bold cursor-pointer hover:bg-white/70">
                  Clear flag
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
