import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Clock, ChevronDown, Search, Plus, Check } from 'lucide-react'

export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null
  const clean = timeStr.trim().toUpperCase()
  const m = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const mer = m[3]
  if (mer === 'PM' && h < 12) h += 12
  if (mer === 'AM' && h === 12) h = 0
  return h * 60 + min
}

export interface Time12hPickerProps {
  label: string
  value: string
  onChange: (val12h: string) => void
}

/**
 * 12-Hour AM/PM Time Picker matching CleanerMultiSelect and Address popover design
 * with custom time support and soft blue/green active AM/PM styling.
 */
export function Time12hPicker({
  label,
  value,
  onChange,
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
    if (h > 12) h = 12
    if (isNaN(min) || min < 0) min = 0
    if (min > 59) min = 59
    const normH = String(h).padStart(2, '0')
    const normM = String(min).padStart(2, '0')
    onChange(`${normH}:${normM} ${targetMer}`)
    setIsOpen(false)
  }

  const handleToggleMeridiem = (newMer: 'AM' | 'PM') => {
    if (newMer === meridiem) return
    commitTime(formattedHHMM, newMer)
  }

  const timeSuggestions = useMemo(() => {
    return [
      '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
      '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
      '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
      '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM', '10:00 PM'
    ]
  }, [])

  const filteredSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return timeSuggestions
    return timeSuggestions.filter(t => t.toLowerCase().includes(q))
  }, [search, timeSuggestions])

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
    const candidate = `${normH}:${normM} ${meridiem}`
    if (timeSuggestions.includes(candidate)) return null
    return candidate
  }, [search, meridiem, timeSuggestions])

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        {/* Dropdown Trigger Box (matching Address and Cleaner MultiSelect) */}
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
            <span className="font-bold text-slate-900 tracking-wide">{full12h}</span>
          </div>
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
          />
        </div>

        {/* AM / PM Toggle with Soft Blue/Green Active Color */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 min-h-[42px] items-center shrink-0">
          <button
            type="button"
            onClick={() => handleToggleMeridiem('AM')}
            className={`px-2.5 py-1.5 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
              meridiem === 'AM'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => handleToggleMeridiem('PM')}
            className={`px-2.5 py-1.5 text-[11px] font-extrabold rounded-lg transition-all cursor-pointer ${
              meridiem === 'PM'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {/* Floating Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 w-full min-w-[240px] sm:min-w-[280px] mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
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
                    commitTime(customCandidate, meridiem)
                  } else if (filteredSuggestions.length > 0) {
                    commitTime(filteredSuggestions[0], meridiem)
                  }
                }
              }}
              placeholder="Search or type time (e.g. 09:15, 10:45)..."
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>

          {/* Custom Time Add Option if user types a custom time */}
          {customCandidate && (
            <div
              onClick={() => commitTime(customCandidate, meridiem)}
              className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0 transition-colors"
            >
              <Plus size={13} className="text-emerald-700 stroke-[3]" />
              <span>Use custom time: &ldquo;{customCandidate}&rdquo;</span>
            </div>
          )}

          {/* Time Suggestions List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 divide-y divide-slate-100 pr-0.5">
            {filteredSuggestions.length === 0 && !customCandidate ? (
              <div className="py-4 text-center text-[12px] text-slate-400">
                No times found. Type custom time above.
              </div>
            ) : (
              filteredSuggestions.map(timeStr => {
                const isSelected = full12h === timeStr
                return (
                  <div
                    key={timeStr}
                    onClick={() => commitTime(timeStr, meridiem)}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between text-[12.5px] ${
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

