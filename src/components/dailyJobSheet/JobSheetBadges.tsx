import React, { useState } from 'react'
import type { PaymentMode } from '@/types'

export function PaymentBadge({ mode }: { mode: PaymentMode }) {
  const cfg: Record<PaymentMode, string> = {
    Cash:    'bg-emerald-50 text-emerald-800 border-emerald-300',
    Online:  'bg-blue-50 text-blue-800 border-blue-300',
    Pending: 'bg-red-50 text-red-700 border-red-300',
    Monthly: 'bg-purple-50 text-purple-800 border-purple-300',
    Above:   'bg-amber-50 text-amber-800 border-amber-300',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shadow-xs ${cfg[mode]}`}>
      {mode}
    </span>
  )
}

export function AddressCell({ address, area, isDark }: { address: string; area?: string; isDark?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [showPopover, setShowPopover] = useState(false)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)

  if (!address || address === '—' || address === '-') {
    return <span className={isDark ? "text-emerald-700 font-medium" : "text-slate-400"}>—</span>
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setCoords({ x: rect.left, y: rect.top })
    setShowPopover(true)
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="relative inline-block max-w-[170px] group select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowPopover(false)}
    >
      <div className={`truncate font-medium cursor-pointer flex items-center gap-1 ${
        isDark
          ? 'text-emerald-950 group-hover:text-emerald-700 group-hover:underline'
          : 'text-slate-700 group-hover:text-emerald-700 group-hover:underline'
      }`}>
        <span className="truncate">{address}</span>
      </div>

      {showPopover && coords && (
        <div
          className="fixed z-50 w-80 p-3.5 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 text-[12px] animate-in fade-in zoom-in-95 pointer-events-auto ring-1 ring-slate-900/10"
          style={{
            left: Math.max(10, Math.min(coords.x, window.innerWidth - 340)),
            top: coords.y - 8,
            transform: 'translateY(-100%)',
          }}
          onMouseEnter={() => setShowPopover(true)}
          onMouseLeave={() => setShowPopover(false)}
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
              📍 Full Address
            </span>
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10.5px] font-bold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
              title="Copy to clipboard"
            >
              {copied ? <span className="text-emerald-600 font-bold">✓ Copied</span> : <span>📋 Copy</span>}
            </button>
          </div>
          <p className="font-semibold text-[13px] leading-relaxed text-slate-800 break-words select-text">
            {address}
          </p>
          {area && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Location / Zone:</span>
              <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{area}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
