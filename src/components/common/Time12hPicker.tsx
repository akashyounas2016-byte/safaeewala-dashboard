import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Clock, ChevronDown, Search, Plus, Check } from 'lucide-react'

export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null
  const clean = timeStr.trim().toUpperCase()
  // 12-hour AM/PM format (e.g. "9:00 AM", "09:00 AM", "1:30 PM")
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (ampmMatch && ampmMatch[3]) {
    let h = parseInt(ampmMatch[1], 10)
    const min = parseInt(ampmMatch[2], 10)
    const mer = ampmMatch[3]
    if (mer === 'PM' && h < 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
    return (h * 60 + min) % (24 * 60)
  }
  // 24-hour format (e.g. "09:00", "13:30", "22:00")
  const m24 = clean.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) {
    let h = parseInt(m24[1], 10)
    const min = parseInt(m24[2], 10)
    // If h is between 1 and 6 without AM/PM in working context, map to afternoon
    if (h >= 1 && h <= 6) h += 12
    return (h * 60 + min) % (24 * 60)
  }
  return null
}

/**
 * UX-68: the dropdown lists plain numbers in 30-minute steps; Morning (AM) or Evening (PM) is chosen
 * separately. Morning starts at 9:00. Any other time can be typed.
 */
/** Times from fromH:00 up to and including toH:00 (or the last step of toH), every `step` minutes, no AM / PM */
export function timeSteps(fromH: number, toH: number, step = 30, includeLastHourSteps = true): string[] {
  const out: string[] = []
  for (let h = fromH; h <= toH; h++) {
    const h12 = String(h % 12 || 12).padStart(2, '0')
    for (let m = 0; m < 60; m += step) {
      if (h === toH && m > 0 && !includeLastHourSteps) break
      out.push(`${h12}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
}
export const MORNING_TIMES = timeSteps(9, 11)            // 09:00 … 11:30
export const EVENING_TIMES = timeSteps(12, 23, 30, false) // 12:00 … 11:00

export const TIME_12H_SUGGESTIONS = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM',
  '11:00 PM'
]

export interface Time12hPickerProps {
  label: string
  value: string
  onChange: (val12h: string) => void
  disabled?: boolean
  className?: string
  /** Open the list above the field (like the material drop-up in Add Job) — UX-68 */
  dropUp?: boolean
  /** Minutes between the listed times (default 30) */
  stepMinutes?: number
}

/**
 * VPS-Standardized 12-Hour AM/PM Time Picker
 * Displays 12h format (e.g. 09:00 AM, 01:00 PM) with Clock icon,
 * dedicated AM/PM toggle pill button, floating popover with search & custom time input,
 * and 30-minute interval suggestions from 07:00 AM to 11:00 PM.
 */
export function Time12hPicker({
  label,
  value,
  onChange,
  disabled = false,
  className = '',
  dropUp = false,
  stepMinutes = 30,
}: Time12hPickerProps) {
  const mins = parseTimeToMinutes(value) ?? (label.toLowerCase().includes('start') ? 9 * 60 : 13 * 60)
  const h24 = Math.floor(mins / 60)
  const m = String(mins % 60).padStart(2, '0')
  const meridiem: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  const formattedHHMM = `${String(h12).padStart(2, '0')}:${m}`
  const full12h = `${formattedHHMM} ${meridiem}`

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [listHalf, setListHalf] = useState<'AM' | 'PM'>(meridiem)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // UX-77: the list floats above the popup (fixed position, portal), so a scrolling popup body never cuts it.
  // It opens up or down, wherever there is more room, and shrinks to fit.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)
  const place = () => {
    const r = containerRef.current?.getBoundingClientRect()
    if (!r) return
    const gap = 6, edge = 8, want = 340
    const above = r.top - gap - edge
    const below = window.innerHeight - r.bottom - gap - edge
    const up = dropUp ? (above >= want || above >= below) : (below < want && above > below)
    const width = Math.max(r.width, 280)
    setPos({
      left: Math.max(edge, Math.min(r.left, window.innerWidth - width - edge)),
      width,
      ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
      maxH: Math.max(180, Math.min(420, up ? above : below)),
    })
  }
  useEffect(() => {
    if (!isOpen) return
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => { window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true) }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current && !containerRef.current.contains(t) && !popRef.current?.contains(t)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setListHalf(meridiem)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setSearch('')
    }
  }, [isOpen])

  // UX-84: switching Morning / Evening (or opening the list) starts the list at its first time
  useEffect(() => {
    if (isOpen && listRef.current) listRef.current.scrollTop = 0
  }, [isOpen, listHalf])

  const commitTime = (raw: string, mer: 'AM' | 'PM') => {
    let targetMer = mer
    const lower = raw.toLowerCase()
    if (lower.includes('pm')) targetMer = 'PM'
    else if (lower.includes('am')) targetMer = 'AM'

    const clean = raw.trim().replace(/[^\d:]/g, '')
    const parts = clean.split(':')
    let h = parseInt(parts[0] || '9', 10)
    let min = parseInt(parts[1] || '0', 10)
    if (isNaN(h) || h < 1) h = 12
    if (h > 12) {
      // If user typed 24h e.g. 14 -> 02 PM
      if (h <= 23) {
        if (h >= 12) {
          targetMer = 'PM'
          h = h % 12 || 12
        } else {
          targetMer = 'AM'
        }
      } else {
        h = 12
      }
    }
    if (isNaN(min) || min < 0) min = 0
    if (min > 59) min = 59
    const normH = String(h).padStart(2, '0')
    const normM = String(min).padStart(2, '0')
    onChange(`${normH}:${normM} ${targetMer}`)
    setIsOpen(false)
  }

  const handleToggleMeridiem = (newMer: 'AM' | 'PM') => {
    if (disabled || newMer === meridiem) return
    commitTime(formattedHHMM, newMer)
  }

  const filteredSuggestions = useMemo(() => {
    const list = stepMinutes === 30
      ? (listHalf === 'AM' ? MORNING_TIMES : EVENING_TIMES)
      : (listHalf === 'AM' ? timeSteps(9, 11, stepMinutes) : timeSteps(12, 23, stepMinutes, false))
    const q = search.trim().toLowerCase().replace(/\s*(am|pm)$/, '')
    if (!q) return list
    return list.filter(t => t.includes(q))
  }, [search, listHalf, stepMinutes])

  const customCandidate = useMemo(() => {
    const q = search.trim().replace(/[^\d:]/g, '')
    if (!q) return null
    const parts = q.split(':')
    const h = parseInt(parts[0], 10)
    if (isNaN(h) || h < 1 || h > 12) return null
    const minVal = parts[1] !== undefined ? parseInt(parts[1] || '0', 10) : 0
    if (isNaN(minVal) || minVal < 0 || minVal > 59) return null
    const normH = String(h).padStart(2, '0')
    const normM = String(minVal).padStart(2, '0')
    const typedMer = /pm/i.test(search) ? 'PM' : /am/i.test(search) ? 'AM' : listHalf
    const candidate = `${normH}:${normM} ${typedMer}`
    if ((typedMer === listHalf) && filteredSuggestions.includes(`${normH}:${normM}`)) return null
    return candidate
  }, [search, listHalf, filteredSuggestions])

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        {/* Dropdown Trigger Box (matching VPS Add New Booking pop-up) */}
        <div
          onClick={() => {
            if (!disabled) { if (!isOpen) place(); setIsOpen(prev => !prev) }
          }}
          className={`flex-1 flex items-center justify-between border rounded-xl px-3 py-2 text-[13px] min-h-[42px] transition-all ${
            disabled
              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              : isOpen
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15 cursor-pointer'
              : 'bg-[#f8fafc] border-[#E4E8EC] hover:border-slate-300 cursor-pointer'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Clock size={15} className="text-emerald-600 shrink-0" />
            <span className="font-bold text-slate-900 tracking-wide tabular-nums">{formattedHHMM}</span>
          </div>
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
          />
        </div>

        {/* AM / PM Toggle with Soft Emerald Active Badge */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 min-h-[42px] items-center shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleToggleMeridiem('AM')}
            title="Morning"
            className={`px-2.5 py-1.5 text-[11px] font-extrabold rounded-lg transition-all ${
              disabled
                ? 'text-slate-400 cursor-not-allowed'
                : meridiem === 'AM'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs cursor-pointer'
                : 'text-slate-500 hover:text-slate-800 cursor-pointer'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleToggleMeridiem('PM')}
            title="Evening"
            className={`px-2.5 py-1.5 text-[11px] font-extrabold rounded-lg transition-all ${
              disabled
                ? 'text-slate-400 cursor-not-allowed'
                : meridiem === 'PM'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs cursor-pointer'
                : 'text-slate-500 hover:text-slate-800 cursor-pointer'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {/* Floating Dropdown Popover */}
      {isOpen && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          className="z-[300] bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col"
        >
          {/* Search / Custom Time Input */}
          <div className="relative mb-2 shrink-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (customCandidate) {
                    commitTime(customCandidate, listHalf)
                  } else if (filteredSuggestions.length > 0) {
                    commitTime(filteredSuggestions[0], listHalf)
                  }
                }
              }}
              placeholder="Type a time, e.g. 9:15 or 7:45 pm"
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>

          {/* Morning / Evening — which half of the day the numbers below are */}
          <div className="flex items-center gap-1 mb-2 shrink-0">
            {(['AM', 'PM'] as const).map(h => (
              <button key={h} type="button" onMouseDown={e => { e.preventDefault(); setListHalf(h) }}
                className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-bold border cursor-pointer ${listHalf === h ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                {h === 'AM' ? 'Morning (AM)' : 'Evening (PM)'}
              </button>
            ))}
          </div>

          {/* Custom Time Add Option if user types a custom time */}
          {customCandidate && (
            <div
              onClick={() => commitTime(customCandidate, listHalf)}
              className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0 transition-colors"
            >
              <Plus size={13} className="text-emerald-700 stroke-[3]" />
              <span>Use custom time: &ldquo;{customCandidate}&rdquo;</span>
            </div>
          )}

          {/* Time Suggestions List */}
          <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-0.5 divide-y divide-slate-100 pr-0.5">
            {filteredSuggestions.length === 0 && !customCandidate ? (
              <div className="py-4 text-center text-[12px] text-slate-400">
                No times found. Type the time above.
              </div>
            ) : (
              filteredSuggestions.map(timeStr => {
                const isSelected = full12h === `${timeStr} ${listHalf}`
                return (
                  <div
                    key={timeStr}
                    onClick={() => commitTime(timeStr, listHalf)}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between text-[12.5px] tabular-nums ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <span>{timeStr}</span>
                    {isSelected && <Check size={13} className="text-emerald-600 stroke-[3]" />}
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Backward-compatible alias
export const TimePicker = Time12hPicker
export type TimePickerProps = Time12hPickerProps
