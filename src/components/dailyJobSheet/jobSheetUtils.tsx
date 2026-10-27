import React, { useState } from 'react'
import type { DailyJob, PaymentMode, MaterialType } from '@/types'

export const MATERIALS: MaterialType[] = ['No', 'Yes', 'Sofa', 'Ladder', 'Sofa Seat']
export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'Online', 'Pending', 'Monthly', 'Above']
export const EXPENSE_CATEGORIES = ['Fuel', 'Parking', 'Toll', 'Vehicle maintenance', 'Supplies', 'Other']
export const COMMON_SERVICES = ['House', 'Deep', 'Sofa', 'Window', 'Office', 'Villa', 'Apartment', 'Carpet', 'Move-in', 'Move-out', 'Other']

export function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'nil' || str.toLowerCase() === 'pending' || str.toLowerCase() === 'monthly' || str.toLowerCase() === 'n/a') return 0
  const cleaned = str.replace(/[^0-9.-]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function formatTimeOnly(val: any): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'number') {
    if (isNaN(val)) return '—'
    const frac = val >= 1 ? val - Math.floor(val) : val
    if (frac >= 0) {
      const totalMinutes = Math.round(frac * 24 * 60)
      const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')
      const mm = String(totalMinutes % 60).padStart(2, '0')
      return `${hh}:${mm}`
    }
  }
  if (val instanceof Date) {
    const hh = String(val.getHours()).padStart(2, '0')
    const mm = String(val.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const str = String(val).trim()
  if (!str || str === '—') return '—'

  const ampmMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)\b/i)
  if (ampmMatch) {
    let hh = parseInt(ampmMatch[1], 10)
    const mm = ampmMatch[2]
    const mer = ampmMatch[3].toUpperCase()
    if (mer === 'PM' && hh < 12) hh += 12
    if (mer === 'AM' && hh === 12) hh = 0
    return `${String(hh).padStart(2, '0')}:${mm}`
  }

  const timeMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/)
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0')
    const mm = timeMatch[2]
    return `${hh}:${mm}`
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const hh = String(parsed.getHours()).padStart(2, '0')
    const mm = String(parsed.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  return str
}

export function calcHours(start: string, end: string): number {
  const s = formatTimeOnly(start)
  const e = formatTimeOnly(end)
  if (s === '—' || e === '—' || !s.includes(':') || !e.includes(':')) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

export function calcOTHours(start: string, end: string): number {
  const s = formatTimeOnly(start)
  const e = formatTimeOnly(end)
  if (s === '—' || e === '—' || !s.includes(':') || !e.includes(':')) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0
  const startMins = sh * 60 + sm
  let endMins     = eh * 60 + em
  // Shift crossing midnight (e.g. 19:00 → 01:00) ends on the next day
  if (endMins < startMins) endMins += 24 * 60
  const OT_CUTOFF = 20 * 60 // 8 PM
  if (endMins <= OT_CUTOFF) return 0
  const otStartMins = Math.max(startMins, OT_CUTOFF)
  const otMins = endMins - otStartMins
  return otMins > 0 ? Math.round(otMins / 60 * 10) / 10 : 0
}

export function fmtDate(d: string) {
  if (!d) return '—'
  const parsed = new Date(d.includes('T') ? d : d + 'T00:00:00')
  if (isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Safely adds or subtracts days from a YYYY-MM-DD string without timezone shifts or day skipping.
 */
export function addDaysToYMD(ymdStr: string, deltaDays: number): string {
  if (!ymdStr || !/^\d{4}-\d{2}-\d{2}$/.test(ymdStr)) {
    ymdStr = new Date().toISOString().split('T')[0]
  }
  const [y, m, d] = ymdStr.split('-').map(Number)
  const utcDate = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const year = utcDate.getUTCFullYear()
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface StaffPalette {
  name: string
  rowBg: string
  borderLeft: string
  nameColor: string
  avatarBg: string
  badgeBg: string
}

export const STAFF_COLOR_PALETTES: StaffPalette[] = [
  {
    name: 'Emerald',
    rowBg: 'bg-emerald-50/70 hover:bg-emerald-100/70',
    borderLeft: 'border-l-[5px] border-l-emerald-500',
    nameColor: 'text-emerald-950 font-bold',
    avatarBg: 'bg-emerald-600 text-white',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    name: 'Sky Blue',
    rowBg: 'bg-sky-50/70 hover:bg-sky-100/70',
    borderLeft: 'border-l-[5px] border-l-sky-500',
    nameColor: 'text-sky-950 font-bold',
    avatarBg: 'bg-sky-600 text-white',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  {
    name: 'Violet',
    rowBg: 'bg-purple-50/70 hover:bg-purple-100/70',
    borderLeft: 'border-l-[5px] border-l-purple-500',
    nameColor: 'text-purple-950 font-bold',
    avatarBg: 'bg-purple-600 text-white',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    name: 'Amber',
    rowBg: 'bg-amber-50/70 hover:bg-amber-100/70',
    borderLeft: 'border-l-[5px] border-l-amber-500',
    nameColor: 'text-amber-950 font-bold',
    avatarBg: 'bg-amber-600 text-white',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    name: 'Teal',
    rowBg: 'bg-teal-50/70 hover:bg-teal-100/70',
    borderLeft: 'border-l-[5px] border-l-teal-500',
    nameColor: 'text-teal-950 font-bold',
    avatarBg: 'bg-teal-600 text-white',
    badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  {
    name: 'Indigo',
    rowBg: 'bg-indigo-50/70 hover:bg-indigo-100/70',
    borderLeft: 'border-l-[5px] border-l-indigo-500',
    nameColor: 'text-indigo-950 font-bold',
    avatarBg: 'bg-indigo-600 text-white',
    badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  {
    name: 'Rose',
    rowBg: 'bg-rose-50/70 hover:bg-rose-100/70',
    borderLeft: 'border-l-[5px] border-l-rose-500',
    nameColor: 'text-rose-950 font-bold',
    avatarBg: 'bg-rose-600 text-white',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  {
    name: 'Orange',
    rowBg: 'bg-orange-50/70 hover:bg-orange-100/70',
    borderLeft: 'border-l-[5px] border-l-orange-500',
    nameColor: 'text-orange-950 font-bold',
    avatarBg: 'bg-orange-600 text-white',
    badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
  },
]

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

export interface ColumnConfig {
  id: string
  label: string
}

export const ALL_COLUMNS: ColumnConfig[] = [
  { id: 'staff',        label: 'Staff' },
  { id: 'start_time',   label: 'Start Time' },
  { id: 'end_time',     label: 'End Time' },
  { id: 'address',      label: 'Address' },
  { id: 'area',         label: 'Location / Zone' },
  { id: 'charges',      label: 'Charges' },
  { id: 'received',     label: 'Received' },
  { id: 'pending',      label: 'Pending' },
  { id: 'duty_hours',   label: 'Duty Hrs' },
  { id: 'ot_hours',     label: 'OT Hrs' },
  { id: 'material',     label: 'Material' },
  { id: 'payment_mode', label: 'Payment Mode' },
  { id: 'remarks',      label: 'Remarks' },
  { id: 'service',      label: 'Service' },
  { id: 'actions',      label: 'Actions' },
]

export const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  staff:        true,
  start_time:   true,
  end_time:     true,
  address:      true,
  area:         true,
  charges:      true,
  received:     true,
  pending:      true,
  duty_hours:   true,
  ot_hours:     true,
  material:     true,
  payment_mode: true,
  remarks:      true,
  service:      true,
  actions:      true,
}
