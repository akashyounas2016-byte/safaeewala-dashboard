import type { ReactNode } from 'react'
import { Clock, User } from 'lucide-react'
import { cleanerPalette, cleanerInitials } from '@/lib/cleanerColors'

/**
 * Building blocks of the Clients and Monthly Clients cards (UX-67). Same look as the Daily Job Sheet
 * and the booking cards (UX-63): the lead cleaner's colour on the left edge, cleaner avatars,
 * a schedule strip and a money strip — so every client card reads the same way.
 */

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** Card frame: lead cleaner colour on the left; monthly clients get the emerald tint */
export function ClientCardShell({ lead, monthly, onClick, children, className = '' }: { lead?: string; monthly?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  const edge = lead ? cleanerPalette(lead).borderLeft : monthly ? 'border-l-[5px] border-l-emerald-500' : 'border-l-[5px] border-l-slate-300'
  return (
    <div
      onClick={onClick}
      className={`${edge} rounded-2xl border ${monthly ? 'bg-gradient-to-b from-emerald-50/60 to-white border-emerald-200' : 'bg-white border-[#E4E8EC]'} p-4 cursor-pointer transition-all shadow-[0_4px_18px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_28px_rgba(15,23,42,0.10)] flex flex-col justify-between gap-3 min-w-0 group ${className}`}
    >
      {children}
    </div>
  )
}

/** Overlapping cleaner avatars in their Daily Job Sheet colours, with names */
export function CleanerStack({ names, empty = 'No cleaner assigned' }: { names: string[]; empty?: string }) {
  const list = names.map(n => n.trim()).filter(Boolean)
  if (list.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11.5px] text-slate-400 min-w-0">
        <span className="w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center shrink-0"><User size={12} /></span>
        <span className="truncate">{empty}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex -space-x-2 shrink-0">
        {list.slice(0, 3).map(n => (
          <span key={n} title={n} className={`w-7 h-7 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-black ${cleanerPalette(n).avatarBg}`}>
            {cleanerInitials(n)}
          </span>
        ))}
        {list.length > 3 && (
          <span className="w-7 h-7 rounded-full ring-2 ring-white bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-black">+{list.length - 3}</span>
        )}
      </div>
      <p className={`text-[12px] truncate ${cleanerPalette(list[0]).nameColor}`} title={list.join(', ')}>{list.join(', ')}</p>
    </div>
  )
}

/** Mon … Sun strip: scheduled days filled; time slot after it. No schedule → a hint how to set one */
export function WeekStrip({ days, time }: { days?: string[]; time?: string }) {
  const on = new Set((days || []).map(d => d.toLowerCase()))
  if (on.size === 0) {
    return (
      <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1"
        title="Open the client → Edit → 7-Day Schedule to make the visits permanent">
        No fixed schedule — set it in Edit → 7-Day Schedule
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-0.5">
        {WEEK.map(d => (
          <span key={d} title={d}
            className={`w-6 h-6 rounded-md text-[9.5px] font-black flex items-center justify-center ${on.has(d.toLowerCase()) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
            {d.slice(0, 2)}
          </span>
        ))}
      </div>
      {time && <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1"><Clock size={11} className="text-slate-400" />{time}</span>}
    </div>
  )
}

/** Billed · Received · Due — the same money strip as the booking cards */
export function MoneyStrip({ billed, received, due }: { billed: number; received: number; due: number }) {
  const cell = 'flex-1 min-w-0 px-2 py-1.5 text-center'
  return (
    <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden divide-x divide-slate-200">
      <div className={cell}><p className="text-[9.5px] uppercase font-bold text-slate-400">Billed</p><p className="text-[12.5px] font-black text-slate-900 truncate">AED {billed.toLocaleString()}</p></div>
      <div className={cell}><p className="text-[9.5px] uppercase font-bold text-slate-400">Received</p><p className="text-[12.5px] font-black text-emerald-700 truncate">AED {received.toLocaleString()}</p></div>
      <div className={`${cell} ${due > 0 ? 'bg-amber-50' : ''}`}><p className="text-[9.5px] uppercase font-bold text-slate-400">Due</p><p className={`text-[12.5px] font-black truncate ${due > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{due > 0 ? `AED ${due.toLocaleString()}` : 'Nil'}</p></div>
    </div>
  )
}

/** Footer button; `tone` picks the colour; stops the click from opening the card */
export function CardAction({ onClick, icon, label, tone = 'slate', title }: { onClick: () => void; icon: ReactNode; label: string; tone?: 'teal' | 'emerald' | 'slate' | 'indigo' | 'rose'; title?: string }) {
  const tones = {
    teal: 'text-teal-800 bg-teal-50 border-teal-200 hover:bg-teal-600',
    emerald: 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-600',
    slate: 'text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-700',
    indigo: 'text-indigo-800 bg-indigo-50 border-indigo-200 hover:bg-indigo-600',
    rose: 'text-rose-700 bg-white border-rose-200 hover:bg-rose-600',
  }[tone]
  return (
    <button type="button" title={title || label} onClick={e => { e.stopPropagation(); onClick() }}
      className={`h-9 min-w-0 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors hover:text-white ${tones}`}>
      <span className="shrink-0">{icon}</span><span className="truncate">{label}</span>
    </button>
  )
}
