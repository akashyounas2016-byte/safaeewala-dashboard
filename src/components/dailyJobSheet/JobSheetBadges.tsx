import React from 'react'
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

export function cleanAddressDisplay(val: unknown): string {
  if (!val) return '—'
  const str = String(val).trim()
  if (!str) return '—'
  return str
    .replace(/\s*\(Monthly\)/gi, '')
    .replace(/\s*\[Monthly\]/gi, '')
    .replace(/\s+Monthly\s*$/i, '')
    .trim() || '—'
}

export function isAddressMonthly(val: unknown): boolean {
  if (!val) return false
  return /\(Monthly\)|\[Monthly\]|\bMonthly Client\b/i.test(String(val))
}

export function AddressCell({ address, isDark }: { address: string; area?: string; isDark?: boolean }) {
  if (!address || address === '—' || address === '-') {
    return <span className={isDark ? "text-emerald-700 font-medium" : "text-slate-400"}>—</span>
  }

  const cleanAddr = cleanAddressDisplay(address)

  return (
    <div className="relative inline-flex items-center gap-1.5 max-w-[280px] select-none flex-wrap">
      <span className={`truncate font-medium ${
        isDark ? 'text-emerald-950 font-semibold' : 'text-slate-800'
      }`}>
        {cleanAddr}
      </span>
    </div>
  )
}
