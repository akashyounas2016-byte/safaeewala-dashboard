import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Clock, ChevronDown, Search, Plus, Check } from 'lucide-react'

export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null
  const clean = timeStr.trim().toUpperCase()
  // 12-hour AM/PM format
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (ampmMatch && ampmMatch[3]) {
    let h = parseInt(ampmMatch[1], 10)
    const min = parseInt(ampmMatch[2], 10)
    const mer = ampmMatch[3]
    if (mer === 'PM' && h < 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
    return (h * 60 + min) % (24 * 60)
  }
  // 24-hour numerical format e.g. "09:00", "13:30", "22:00"
  const m24 = clean.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) {
    let h = parseInt(m24[1], 10)
    const min = parseInt(m24[2], 10)
    // If h is between 1 and 7 without AM/PM in working day context, it maps to afternoon (13:00 - 19:00)
    if (h >= 1 && h <= 7) h += 12
    return (h * 60 + min) % (24 * 60)
  }
  return null
}

export const NUMERICAL_TIME_SUGGESTIONS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00'
]

export interface TimePickerProps {
  label: string
  value: string
  onChange: (val: string) => void
}

/**
 * Pure Numerical Time Dropdown (9:00 to 22:00 at 30-min intervals)
 * Eliminates AM/PM concept completely.
 */
export function TimePicker({
  label,
  value,
  onChange,
}: TimePickerProps) {
  const mins = parseTimeToMinutes(value) ?? (label.toLowerCase().includes('start') ? 9 * 60 : 13 * 60)
  const h24 = Math.floor(mins / 60)
  const m = String(mins % 60).padStart(2, '0')
  const formattedNumerical = `${String(h24).padStart(2, '0')}:${m}`

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setSearch('')
    }
  }, [isOpen])

  const commitTime = (raw: string) => {
    const clean = raw.trim().replace(/[^\d:]/g, '')
    const parts = clean.split(':')
    let h = parseInt(parts[0] || '9', 10)
    let min = parseInt(parts[1] || '0', 10)
    if (isNaN(h) || h < 0) h = 9
    // If user enters 1 to 7 without 24h, map to afternoon shift (13 to 19)
    if (h >= 1 && h <= 7) h += 12
    if (h > 23) h = 22
    if (isNaN(min) || min < 0) min = 0
    if (min > 59) min = 59
    const norm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    onChange(norm)
    setIsOpen(false)
  }

  const filteredSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return NUMERICAL_TIME_SUGGESTIONS

    // Allow user to search by either 24h or informal 12h number (e.g. '1' -> '13:00', '2' -> '14:00')
    const mapped12hTo24h: Record<string, string> = {
      '1': '13', '01': '13',
      '2': '14', '02': '14',
      '3': '15', '03': '15',
      '4': '16', '04': '16',
      '5': '17', '05': '17',
      '6': '18', '06': '18',
      '7': '19', '07': '19',
      '8': '20', '08': '20',
      '9': '09', '09': '09',
      '10': '22',
    }

    return NUMERICAL_TIME_SUGGESTIONS.filter(t => {
      if (t.includes(q)) return true
      const qPrefix = q.split(':')[0]
      const mappedHour = mapped12hTo24h[qPrefix]
      if (mappedHour && t.startsWith(mappedHour)) return true
      return false
    })
  }, [search])

  const customCandidate = useMemo(() => {
    const q = search.trim().replace(/[^\d:]/g, '')
    if (!q) return null
    const parts = q.split(':')
    let h = parseInt(parts[0], 10)
    if (isNaN(h) || h < 0 || h > 23) return null
    if (h >= 1 && h <= 7) h += 12
    const minVal = parts[1] !== undefined ? parseInt(parts[1] || '0', 10) : 0
    if (isNaN(minVal) || minVal < 0 || minVal > 59) return null
    const norm = `${String(h).padStart(2, '0')}:${String(minVal).padStart(2, '0')}`
    if (NUMERICAL_TIME_SUGGESTIONS.includes(norm)) return null
    return norm
  }, [search])

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        {/* Dropdown Trigger Box */}
        <div
          onClick={() => setIsOpen(prev => !prev)}
          className={`flex-1 flex items-center justify-between border rounded-xl px-3 py-2 text-[13px] min-h-[42px] cursor-pointer transition-all ${
            isOpen
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
              : 'bg-[#f8fafc] border-[#E4E8EC] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Clock size={15} className="text-emerald-600 shrink-0" />
            <span className="font-bold text-slate-900 tracking-wide text-[13.5px] tabular-nums">
              {formattedNumerical}
            </span>
          </div>
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
          />
        </div>
      </div>

      {/* Floating Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 w-full min-w-[200px] mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {/* Search / Custom Time Input */}
          <div className="relative mb-1.5 shrink-0">
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
                    commitTime(customCandidate)
                  } else if (filteredSuggestions.length > 0) {
                    commitTime(filteredSuggestions[0])
                  }
                }
              }}
              placeholder="Type time (e.g. 09:00, 14:30)..."
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>

          {/* Custom Time Add Option if user types a custom time */}
          {customCandidate && (
            <div
              onClick={() => commitTime(customCandidate)}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[11.5px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0 transition-colors"
            >
              <Plus size={13} className="text-emerald-700 stroke-[3]" />
              <span>Use &ldquo;{customCandidate}&rdquo;</span>
            </div>
          )}

          {/* Numerical Time Suggestions List (09:00 to 22:00 in 30-min intervals) */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 divide-y divide-slate-100 pr-0.5">
            {filteredSuggestions.length === 0 && !customCandidate ? (
              <div className="py-4 text-center text-[12px] text-slate-400">
                No times found. Type custom time above.
              </div>
            ) : (
              filteredSuggestions.map(timeStr => {
                const isSelected = formattedNumerical === timeStr
                return (
                  <div
                    key={timeStr}
                    onClick={() => commitTime(timeStr)}
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
        </div>
      )}
    </div>
  )
}

// Backward-compatible alias
export const Time12hPicker = TimePicker
export type Time12hPickerProps = TimePickerProps
