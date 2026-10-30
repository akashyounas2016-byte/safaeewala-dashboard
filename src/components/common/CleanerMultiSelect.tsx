import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown, Search, X, Users, Building2 } from 'lucide-react'
import { useData } from '@/store/DataContext'
import { isThirdPartyEmployee } from '@/lib/utils'

export interface CleanerOption {
  id?: string
  full_name: string
  role?: string
}

export interface CleanerMultiSelectProps {
  cleaners: Array<string | CleanerOption>
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  label?: string
  name?: string
  required?: boolean
  disabled?: boolean
  compact?: boolean
  className?: string
  busyCleaners?: Map<string, { shiftCount?: number; info?: string }> | Set<string> | string[]
}

export function CleanerMultiSelect({
  cleaners,
  selected = [],
  onChange,
  placeholder = 'Select cleaner(s)...',
  label,
  name,
  required = false,
  disabled = false,
  compact = false,
  className = '',
  busyCleaners,
}: CleanerMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { employees: allEmps = [], agencies: allAgencies = [] } = useData()

  // Agency lookup map for third-party / agency staff tags
  const cleanerAgencyMap = useMemo(() => {
    const map = new Map<string, string>()
    allEmps.forEach(emp => {
      if (isThirdPartyEmployee(emp)) {
        const agency = allAgencies.find(a => a.id === emp.agency_id)
        const aName = emp.agency_name || agency?.name
        if (aName && !aName.toLowerCase().includes('safaeewala') && !aName.toLowerCase().includes('parent company')) {
          map.set(emp.full_name.trim().toLowerCase(), aName.trim())
        }
      }
    })
    return map
  }, [allEmps, allAgencies])

  // Normalize cleaners into unique string list
  const cleanerList = useMemo(() => {
    const set = new Set<string>()
    cleaners.forEach(c => {
      const nameStr = typeof c === 'string' ? c : c?.full_name
      if (nameStr && nameStr.trim()) {
        set.add(nameStr.trim())
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [cleaners])

  // Filtered by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cleanerList
    return cleanerList.filter(name => name.toLowerCase().includes(q))
  }, [cleanerList, search])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setSearch('')
    }
  }, [isOpen])

  const toggleCleaner = (cleanerName: string) => {
    if (selected.includes(cleanerName)) {
      onChange(selected.filter(s => s !== cleanerName))
    } else {
      onChange([...selected, cleanerName])
    }
  }

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    const allFiltered = Array.from(new Set([...selected, ...filtered]))
    onChange(allFiltered)
  }

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (search.trim()) {
      onChange(selected.filter(s => !filtered.includes(s)))
    } else {
      onChange([])
    }
  }

  const handleRemoveOne = (e: React.MouseEvent, cleanerName: string) => {
    e.stopPropagation()
    onChange(selected.filter(s => s !== cleanerName))
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Hidden input to support standard HTML FormData */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={selected.join(', ')}
          required={required && selected.length === 0}
        />
      )}

      {/* Trigger Button (Single-line Fixed Height with Horizontal Scroll for Multiple Cleaners) */}
      <div
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={selected.length > 0 ? `Selected cleaners:\n${selected.join('\n')}` : undefined}
        className={`w-full flex items-center justify-between border rounded-xl transition-all cursor-pointer ${
          compact ? 'px-2.5 py-1 text-[12px] h-[34px] min-h-[34px] max-h-[34px]' : 'px-3 py-1.5 text-[13px] h-[42px] min-h-[42px] max-h-[42px]'
        } ${
          disabled
            ? 'bg-slate-100/60 border-slate-200/60 text-slate-400 cursor-not-allowed'
            : isOpen
              ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
              : selected.length > 0
                ? 'bg-emerald-50/40 border-emerald-300/80 text-slate-800 hover:border-emerald-400'
                : 'bg-[#f8fafc] border-[#E4E8EC] text-slate-400 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-nowrap flex-1 min-w-0 pr-1 py-0.5">
          {selected.length === 0 ? (
            <span className="text-slate-400 truncate">{placeholder}</span>
          ) : compact ? (
            <span className="font-bold text-emerald-900 truncate">
              {selected.length === 1 ? selected[0] : `${selected[0]} +${selected.length - 1}`}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-nowrap">
              {selected.map(name => {
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-[11px] font-bold bg-white text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs shrink-0 whitespace-nowrap"
                  >
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={e => handleRemoveOne(e, name)}
                      className="p-0.5 rounded hover:bg-emerald-100 text-emerald-700 cursor-pointer ml-0.5"
                      title={`Remove ${name}`}
                    >
                      <X size={10} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400 ml-1">
          {selected.length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleClearAll}
              className="p-1 rounded-md hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
              title="Clear all selected"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
          />
        </div>
      </div>

      {/* Hover Info Box showing all selected cleaner names */}
      {isHovered && selected.length > 0 && !isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-40 bg-slate-900/95 text-white backdrop-blur-sm rounded-xl p-3 shadow-xl border border-slate-700 text-[11.5px] min-w-[240px] max-w-sm pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700/80 text-[11px] font-bold text-slate-300">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-emerald-400">
              <Users size={13} />
              Selected Cleaners
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded-full font-extrabold text-[10px]">
              {selected.length}
            </span>
          </div>
          <div className="space-y-1">
            {selected.map((name, idx) => {
              const agency = cleanerAgencyMap.get(name.trim().toLowerCase())
              return (
                <div key={name} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="font-semibold text-slate-100 truncate">
                    {idx + 1}. {name}
                  </span>
                  {agency && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                      {agency}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Floating Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-[0_12px_36px_rgba(15,23,42,0.16)] p-2.5 text-slate-800 animate-in fade-in zoom-in-95 duration-100">
          {/* Search box & Actions */}
          <div className="space-y-2 mb-2 pb-2 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search staff / cleaner..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white text-slate-800 placeholder-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] px-1 font-bold">
              <span className="text-slate-500">
                {selected.length} of {cleanerList.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>

          {/* Cleaners list with checkboxes */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-slate-400">
                No cleaners found matching "{search}"
              </div>
            ) : (
              filtered.map(cleanerName => {
                const isChecked = selected.includes(cleanerName)
                const nameLower = cleanerName.trim().toLowerCase()
                const agencyTag = cleanerAgencyMap.get(nameLower)
                const busyItem = busyCleaners instanceof Map
                  ? busyCleaners.get(nameLower)
                  : busyCleaners instanceof Set
                    ? (busyCleaners.has(nameLower) ? { info: 'Assigned to another shift on this date' } : null)
                    : Array.isArray(busyCleaners) && busyCleaners.map(s => s.trim().toLowerCase()).includes(nameLower)
                      ? { info: 'Assigned to another shift on this date' }
                      : null

                return (
                  <label
                    key={cleanerName}
                    onClick={() => toggleCleaner(cleanerName)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[12.5px] cursor-pointer transition-colors select-none ${
                      isChecked
                        ? 'bg-emerald-50 text-emerald-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>

                      <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-extrabold shrink-0 border border-slate-200">
                        {cleanerName.charAt(0).toUpperCase()}
                      </div>

                      <span className="truncate flex-1 min-w-0 font-medium">{cleanerName}</span>

                      {/* Compact Third-Party Agency Tag (truncated, hover for full title) */}
                      {agencyTag && (
                        <span
                          title={`Agency: ${agencyTag}`}
                          className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300/80 shrink-0 uppercase tracking-tight max-w-[70px] truncate cursor-help"
                        >
                          {agencyTag}
                        </span>
                      )}

                      {/* Compact Busy / Working Tag */}
                      {busyItem && (
                        <span
                          title={`Busy / Working: ${busyItem.info || 'Assigned to another shift on this date'}`}
                          className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0 uppercase tracking-tight cursor-help"
                        >
                          Busy
                        </span>
                      )}
                    </div>

                    {isChecked && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 shrink-0 bg-white/80 px-1.5 py-0.2 rounded border border-emerald-200">
                        Assigned
                      </span>
                    )}
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
