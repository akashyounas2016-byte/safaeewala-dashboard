import React, { useState, useEffect, useMemo, useRef } from 'react'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { QuickNewClientModal } from '@/components/common/QuickNewClientModal'
import { useData } from '@/store/DataContext'
import type { DailyJob, MaterialType, PaymentMode, Client } from '@/types'
import {
  cleanNum,
  calcHours,
  calcOTHours,
  PAYMENT_MODES,
  ROW_COLOR_PRESETS,
  formatTime12h,
  formatTime24h,
} from './jobSheetUtils'
import { addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { todayDubai } from '@/lib/dubaiTime'
import { notify } from '@/lib/notify'
import {
  Users,
  Clock,
  MapPin,
  Building2,
  CreditCard,
  Check,
  X,
  Palette,
  Package,
  Sparkles,
  FileText,
  Search,
  ChevronDown,
  Plus,
} from 'lucide-react'

export interface AddJobFormProps {
  employees: { full_name: string }[]
  onSave: (j: Omit<DailyJob, 'id' | 'created_at'>) => void
  onClose: () => void
  initial?: Partial<DailyJob>
  clients?: Client[]
  existingJobsForDate?: DailyJob[]
}

const DEFAULT_PRESET_MATERIALS = [
  'No',
  'Yes',
  'Chemicals Only',
  'Machines Only',
  'Sofa Kit',
  'Ladder',
]

const POPULAR_AREAS = [
  'Downtown Dubai',
  'Dubai Marina',
  'Business Bay',
  'Jumeirah Village Circle (JVC)',
  'Jumeirah Lake Towers (JLT)',
  'Palm Jumeirah',
  'The Greens',
  'Discovery Gardens',
  'Al Barsha',
  'Dubai Hills Estate',
  'Mirdif',
  'Dubai Silicon Oasis',
  'Motor City',
  'JBR',
  'Damac Hills',
  'Deira',
  'Bur Dubai',
  'Al Furjan',
  'Arabian Ranches',
]


function parseToMinutes(t?: string): number | null {
  if (!t) return null
  const clean = t.trim().toUpperCase()
  const m = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const mer = m[3]
  if (mer === 'PM' && h < 12) h += 12
  if (mer === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function checkTimesOverlap(startA?: string, endA?: string, startB?: string, endB?: string): boolean {
  const sA = parseToMinutes(startA)
  const eA = parseToMinutes(endA)
  const sB = parseToMinutes(startB)
  const eB = parseToMinutes(endB)
  if (sA === null || eA === null || sB === null || eB === null) return false
  return sA < eB && sB < eA
}

/**
 * 12-Hour AM/PM Time Picker matching the CleanerMultiSelect and Address popover design
 * with custom time support and soft blue/green active AM/PM styling.
 */
function Time12hPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (val12h: string) => void
}) {
  const mins = parseToMinutes(value) ?? (label.toLowerCase().includes('start') ? 9 * 60 : 13 * 60)
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
                    <div className="flex items-center gap-2">
                      <Clock size={12} className={isSelected ? 'text-emerald-600' : 'text-slate-400'} />
                      <span>{timeStr}</span>
                    </div>
                    {isSelected && <Check size={14} className="text-emerald-600 stroke-[3] shrink-0" />}
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

export function AddJobForm({
  employees,
  onSave,
  onClose,
  initial,
  existingJobsForDate = [],
}: AddJobFormProps) {
  const { clients, dailyJobs = [] } = useData()

  // ── Staff & Team State ──
  const [selectedStaff, setSelectedStaff] = useState<string[]>(() => {
    if (!initial?.staff_name) return []
    return initial.staff_name.split(/[,+/&]|\band\b/i).map(s => s.trim()).filter(Boolean)
  })

  // ── Date ──
  const [date, setDate] = useState(() => initial?.date || todayDubai())

  // ── Busy / Working Cleaners on this Date (for dropdown tag & tooltip) ──
  const busyCleanersMap = useMemo(() => {
    const map = new Map<string, { shiftCount: number; info: string }>()
    const targetDateJobs = existingJobsForDate.length > 0
      ? existingJobsForDate
      : dailyJobs.filter(j => j.date === date)

    targetDateJobs.forEach(j => {
      if (!j.staff_name) return
      const names = j.staff_name.split(/[,+/&]|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean)
      const timeStr = j.start_time && j.end_time ? `${formatTime12h(j.start_time)} - ${formatTime12h(j.end_time)}` : ''
      const addrStr = j.address ? ` (${j.address})` : ''
      names.forEach(name => {
        if (!map.has(name)) {
          map.set(name, {
            shiftCount: 1,
            info: timeStr ? `${timeStr}${addrStr}` : `Active on ${date}`
          })
        } else {
          const prev = map.get(name)!
          prev.shiftCount += 1
          if (timeStr && !prev.info.includes(timeStr)) {
            prev.info += `, ${timeStr}`
          }
        }
      })
    })
    return map
  }, [existingJobsForDate, dailyJobs, date])

  // Auto-generate team name when multiple cleaners selected
  const defaultTeamName = useMemo(() => {
    if (selectedStaff.length < 2) return ''
    if (initial?.team_name) return initial.team_name
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const usedLetters = new Set<string>()
    existingJobsForDate.forEach(j => {
      if (j.team_name && j.team_name.startsWith('Team ')) {
        const letter = j.team_name.replace('Team ', '').trim()
        if (letter) usedLetters.add(letter.toUpperCase())
      }
    })
    for (let i = 0; i < letters.length; i++) {
      if (!usedLetters.has(letters[i])) {
        return `Team ${letters[i]}`
      }
    }
    return `Team ${selectedStaff.slice(0, 2).join(' & ')}`
  }, [selectedStaff.length, existingJobsForDate, initial?.team_name])

  const [teamName, setTeamName] = useState(() => initial?.team_name || '')

  useEffect(() => {
    if (selectedStaff.length >= 2) {
      if (!teamName) {
        setTeamName(defaultTeamName)
      }
    } else {
      setTeamName('')
    }
  }, [selectedStaff.length, defaultTeamName])

  // ── Address & Building State ──
  const [address, setAddress] = useState(initial?.address ?? '')
  const [area, setArea] = useState(initial?.area ?? '')
  const [buildingDropdownOpen, setBuildingDropdownOpen] = useState(false)
  const [buildingSearch, setBuildingSearch] = useState('')
  const buildingRef = useRef<HTMLDivElement>(null)
  const buildingSearchInputRef = useRef<HTMLInputElement>(null)

  // ── Quick Client Registration State (Automatic Check for Unregistered Clients) ──
  const [showQuickClientModal, setShowQuickClientModal] = useState(false)
  const [unregisteredClientName, setUnregisteredClientName] = useState('')
  const [hasConfirmedUnregistered, setHasConfirmedUnregistered] = useState(false)

  // ── Area Dropdown State ──
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false)
  const [areaSearch, setAreaSearch] = useState('')
  const areaRef = useRef<HTMLDivElement>(null)
  const areaSearchInputRef = useRef<HTMLInputElement>(null)

  // ── Timing & Duration (12-Hour AM/PM Format) ──
  const [startTime, setStartTime] = useState(() => formatTime12h(initial?.start_time || '09:00 AM'))
  const [endTime, setEndTime]     = useState(() => formatTime12h(initial?.end_time || '09:00 AM'))
  const [dutyHours, setDutyHours] = useState<number>(() => {
    if (initial?.duty_hours) return Number(initial.duty_hours)
    return calcHours(initial?.start_time || '09:00 AM', initial?.end_time || '09:00 AM') || 0
  })
  const [otHours, setOtHours]     = useState<number | string>(() => {
    if (initial?.ot_hours !== undefined) return initial.ot_hours
    return calcOTHours(initial?.start_time || '09:00 AM', initial?.end_time || '09:00 AM')
  })
  const [isOvertime, setIsOvertime] = useState(Boolean(initial?.is_overtime || Number(otHours) > 0))

  const handleStartTimeChange = (newStart12h: string) => {
    setStartTime(newStart12h)
    if (newStart12h && dutyHours > 0) {
      const calculatedEnd24 = addHoursToTime(newStart12h, dutyHours)
      const calculatedEnd12h = formatTime12h(calculatedEnd24)
      setEndTime(calculatedEnd12h)
      const calculatedOT = calcOTHours(newStart12h, calculatedEnd12h)
      setOtHours(calculatedOT)
      setIsOvertime(calculatedOT > 0)
    }
  }

  const handleEndTimeChange = (newEnd12h: string) => {
    setEndTime(newEnd12h)
    if (startTime && newEnd12h) {
      const duration = calcDurationFromTimes(startTime, newEnd12h)
      if (duration > 0) {
        setDutyHours(duration)
        const calculatedOT = calcOTHours(startTime, newEnd12h)
        setOtHours(calculatedOT)
        setIsOvertime(calculatedOT > 0)
      }
    }
  }

  const handleDutyHoursChange = (newDuty: number) => {
    setDutyHours(newDuty)
    if (startTime && newDuty > 0) {
      const calculatedEnd24 = addHoursToTime(startTime, newDuty)
      const calculatedEnd12h = formatTime12h(calculatedEnd24)
      setEndTime(calculatedEnd12h)
      const calculatedOT = calcOTHours(startTime, calculatedEnd12h)
      setOtHours(calculatedOT)
      setIsOvertime(calculatedOT > 0)
    }
  }

  // ── Financials ──
  const [charges, setCharges] = useState<number | string>(initial?.charges ?? '')
  const [received, setReceived] = useState<number | string>(initial?.received ?? '')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial?.payment_mode ?? 'Cash')

  // ── Row Color Preset Dropdown (18 options in Drop-Up Mode) ──
  const [rowColor, setRowColor] = useState<string>(initial?.row_color || 'default')
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

  // ── Cleaning Material State & Custom Add with Tick/Cross ──
  const [materialsList, setMaterialsList] = useState<string[]>(() => {
    const list = [...DEFAULT_PRESET_MATERIALS]
    if (initial?.material && !list.includes(String(initial.material))) {
      list.push(String(initial.material))
    }
    return list
  })
  const [selectedMaterial, setSelectedMaterial] = useState<string>(() => {
    return initial?.material ? String(initial.material) : 'No'
  })
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false)
  const [isAddingCustomMaterial, setIsAddingCustomMaterial] = useState(false)
  const [customMaterialInput, setCustomMaterialInput] = useState('')
  const materialRef = useRef<HTMLDivElement>(null)
  const customMaterialInputRef = useRef<HTMLInputElement>(null)

  // ── Remarks ──
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (buildingRef.current && !buildingRef.current.contains(e.target as Node)) {
        setBuildingDropdownOpen(false)
      }
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) {
        setAreaDropdownOpen(false)
      }
      if (materialRef.current && !materialRef.current.contains(e.target as Node)) {
        setMaterialDropdownOpen(false)
        setIsAddingCustomMaterial(false)
      }
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto focus search inputs when dropdown opens
  useEffect(() => {
    if (buildingDropdownOpen) {
      setTimeout(() => buildingSearchInputRef.current?.focus(), 50)
    } else {
      setBuildingSearch('')
    }
  }, [buildingDropdownOpen])

  useEffect(() => {
    if (areaDropdownOpen) {
      setTimeout(() => areaSearchInputRef.current?.focus(), 50)
    } else {
      setAreaSearch('')
    }
  }, [areaDropdownOpen])

  useEffect(() => {
    if (isAddingCustomMaterial) {
      setTimeout(() => customMaterialInputRef.current?.focus(), 50)
    }
  }, [isAddingCustomMaterial])

  // ── Unique Client Buildings & Options ──
  const buildingOptions = useMemo(() => {
    const list: {
      key: string
      building: string
      clientName: string
      area: string
      apartment: string
      isMonthly?: boolean
      client: Client
    }[] = []
    const seen = new Set<string>()

    clients.forEach(c => {
      const bName = c.building_name?.trim() || ''
      const name = c.full_name?.trim() || ''
      const key = `${bName}___${name}`
      const isMonthly = Boolean(
        (c as any).frequency === 'monthly' ||
        (c as any).is_monthly ||
        (c as any).client_type === 'monthly' ||
        (c.service_days && c.service_days.length > 0) ||
        (c.day_cleaner_assignments && Object.keys(c.day_cleaner_assignments).length > 0)
      )
      if (!seen.has(key)) {
        seen.add(key)
        list.push({
          key: c.id,
          building: bName || name,
          clientName: name,
          area: c.area || '',
          apartment: c.apartment || '',
          isMonthly,
          client: c,
        })
      }
    })
    return list
  }, [clients])

  const filteredBuildings = useMemo(() => {
    const q = buildingSearch.trim().toLowerCase()
    if (!q) return buildingOptions
    return buildingOptions.filter(b =>
      b.building.toLowerCase().includes(q) ||
      b.clientName.toLowerCase().includes(q) ||
      b.area.toLowerCase().includes(q)
    )
  }, [buildingOptions, buildingSearch])

  // ── All Available Areas (Presets + Clients) ──
  const availableAreas = useMemo(() => {
    const set = new Set<string>(POPULAR_AREAS)
    clients.forEach(c => {
      if (c.area?.trim()) set.add(c.area.trim())
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [clients])

  const filteredAreas = useMemo(() => {
    const q = areaSearch.trim().toLowerCase()
    if (!q) return availableAreas
    return availableAreas.filter(a => a.toLowerCase().includes(q))
  }, [availableAreas, areaSearch])

  // Client Selection Handler
  const handleSelectClient = (c: Client, chosenAddress?: string) => {
    const finalAddr = chosenAddress || c.building_name || c.full_name || ''
    setAddress(finalAddr)
    if (c.area) setArea(c.area)
    if (c.preferred_cleaner && selectedStaff.length === 0) {
      setSelectedStaff(c.preferred_cleaner.split(/[,+/&]|\band\b/i).map(s => s.trim()).filter(Boolean))
    }
    if (c.scheduled_time) {
      setStartTime(c.scheduled_time)
      if (c.duration_hours) {
        setDutyHours(c.duration_hours)
        const newEnd = addHoursToTime(c.scheduled_time, c.duration_hours)
        setEndTime(newEnd)
        setOtHours(calcOTHours(c.scheduled_time, newEnd))
      }
    }
    setBuildingDropdownOpen(false)
  }

  // Save Custom Material with Tick Icon
  const handleSaveCustomMaterial = () => {
    const trimmed = customMaterialInput.trim()
    if (!trimmed) return
    if (!materialsList.includes(trimmed)) {
      setMaterialsList(prev => [...prev, trimmed])
    }
    setSelectedMaterial(trimmed)
    setIsAddingCustomMaterial(false)
    setCustomMaterialInput('')
    setMaterialDropdownOpen(false)
    notify.success(`Custom material "${trimmed}" added!`)
  }

  const handleCancelCustomMaterial = () => {
    setIsAddingCustomMaterial(false)
    setCustomMaterialInput('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const finalStaff = selectedStaff.join(', ').trim()
    if (!finalStaff) {
      notify.error('Please select at least one cleaner / staff member.')
      return
    }

    if (!address.trim()) {
      notify.error('Please enter the client or building address.')
      return
    }

    // Automatic check: Does this client exist in the system?
    const trimmedAddr = address.trim()
    const isRegistered = clients.some(c =>
      c.full_name?.toLowerCase().trim() === trimmedAddr.toLowerCase() ||
      c.building_name?.toLowerCase().trim() === trimmedAddr.toLowerCase() ||
      `${c.full_name} (${c.building_name || c.area})`.toLowerCase().trim() === trimmedAddr.toLowerCase()
    )

    if (!isRegistered && !hasConfirmedUnregistered) {
      setUnregisteredClientName(trimmedAddr)
      setShowQuickClientModal(true)
      return
    }

    
    // Cleaner shift overlap / clash error check
    if (existingJobsForDate && existingJobsForDate.length > 0 && startTime && endTime) {
      for (const cleaner of selectedStaff) {
        const cLower = cleaner.toLowerCase().trim()
        const clash = existingJobsForDate.find(j => {
          if (!j.staff_name) return false
          const parts = j.staff_name.toLowerCase().split(/[,+]/).map(s => s.trim())
          const matchCleaner = parts.includes(cLower) || j.staff_name.toLowerCase().trim() === cLower
          if (!matchCleaner) return false
          return checkTimesOverlap(startTime, endTime, j.start_time, j.end_time)
        })
        if (clash) {
          notify.error(`⚠️ Cleaner Clash Error: ${cleaner} is already engaged from ${formatTime12h(clash.start_time)} to ${formatTime12h(clash.end_time)} on this date!`)
          return
        }
      }
    }

    onSave({
      date,
      staff_name:   finalStaff,
      team_name:    selectedStaff.length >= 2 ? (teamName.trim() || defaultTeamName) : undefined,
      row_color:    rowColor !== 'default' ? rowColor : undefined,
      start_time:   startTime,
      end_time:     endTime,
      duty_hours:   dutyHours,
      ot_hours:     cleanNum(otHours),
      address:      address.trim(),
      area:         area.trim(),
      material:     selectedMaterial as MaterialType,
      charges:      cleanNum(charges),
      received:     cleanNum(received),
      payment_mode: paymentMode,
      is_overtime:  isOvertime || cleanNum(otHours) > 0,
      remarks:      remarks.trim(),
      service:      '', // Service field permanently removed per user instruction
    })
  }

  // Selected color preset for trigger display
  const selectedColorPreset = useMemo(() => {
    return ROW_COLOR_PRESETS.find(p => p.id === rowColor) || ROW_COLOR_PRESETS[0]
  }, [rowColor])

  return (
    <form id="add-job-entry-form" onSubmit={handleSubmit} className="text-slate-800">
      {/* ── TOP 4 CARDS: 2x2 EQUAL BALANCED 50/50 GRID ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* CARD 1: Staff, Team & Date (50% Width) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 flex flex-col justify-start">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Users size={15} />
                </div>
                <h4 className="text-[13px] font-bold text-slate-900">Staff & Schedule</h4>
              </div>
              {selectedStaff.length >= 2 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Sparkles size={11} className="text-indigo-600" />
                  Team ({selectedStaff.length})
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
              <div>
                <CleanerMultiSelect
                  label="Staff Name"
                  name="staff_name"
                  cleaners={employees}
                  selected={selectedStaff}
                  onChange={setSelectedStaff}
                  placeholder="Select cleaner(s)…"
                  required
                  busyCleaners={busyCleanersMap}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Job Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full text-[13px] px-3.5 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800"
                />
              </div>
            </div>

            {/* Conditional Multi-Cleaner Team Field (Horizontal & Compact) */}
            {selectedStaff.length >= 2 && (
              <div className="pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={12} className="text-indigo-600" />
                    Team Reference <span className="text-slate-400 font-normal lowercase">(auto)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500">Lead: <span className="text-indigo-700">{selectedStaff[0]}</span></span>
                    <button
                      type="button"
                      onClick={() => setTeamName(defaultTeamName)}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="e.g. Team A, Team Alpha…"
                    className="w-full text-[12.5px] px-3 py-1.5 min-h-[38px] border border-indigo-200 rounded-xl bg-indigo-50/40 text-indigo-950 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                  Payment recorded under <b>{selectedStaff[0]}</b>; other cleaner rows display reference <b>{teamName || defaultTeamName}</b>.
                </p>
              </div>
            )}
          </div>

        {/* CARD 2: Address & Location (Clean Dropdown matching Existing Clients & Custom Entry) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 flex flex-col justify-start">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                <MapPin size={15} />
              </div>
              <h4 className="text-[13px] font-bold text-slate-900">Address & Location</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">

              {/* Address Dropdown */}
              <div className="relative" ref={buildingRef}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Address <span className="text-red-500">*</span>
                </label>

                {/* Address Trigger Box */}
                <div
                  onClick={() => setBuildingDropdownOpen(prev => !prev)}
                  className={`w-full flex items-center justify-between border rounded-xl transition-all cursor-pointer px-3.5 py-2 text-[13px] min-h-[42px] ${
                    buildingDropdownOpen
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
                      : address
                        ? 'bg-emerald-50/30 border-emerald-300/80 text-slate-800 hover:border-emerald-400'
                        : 'bg-[#f8fafc] border-[#E4E8EC] text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
                    <Building2 size={15} className={address ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />
                    {address ? (
                      <span className="font-bold text-slate-900 truncate">{address}</span>
                    ) : (
                      <span className="text-slate-400 truncate">Select or enter address…</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {address && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setAddress('')
                        }}
                        className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                    <ChevronDown
                      size={15}
                      className={`text-slate-400 transition-transform duration-200 ${
                        buildingDropdownOpen ? 'rotate-180 text-emerald-600' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Address Dropdown Popover (Wider container so long addresses don't truncate, flicker-free) */}
                {buildingDropdownOpen && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    onMouseMove={e => e.stopPropagation()}
                    style={{ isolation: 'isolate' }}
                    className="absolute z-50 left-0 w-full min-w-[380px] sm:min-w-[460px] max-w-xl mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 max-h-64 flex flex-col transition-none"
                  >
                    {/* Search Bar */}
                    <div className="relative mb-2 shrink-0">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        ref={buildingSearchInputRef}
                        type="text"
                        value={buildingSearch}
                        onChange={e => setBuildingSearch(e.target.value)}
                        placeholder="Search address or client…"
                        className="w-full text-[12.5px] pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-medium"
                      />
                    </div>

                    {/* Custom Value Option if typing custom address */}
                    {buildingSearch.trim() && (
                      <div
                        onClick={() => {
                          const val = buildingSearch.trim()
                          setAddress(val)
                          setHasConfirmedUnregistered(true)
                          setBuildingDropdownOpen(false)
                        }}
                        className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0"
                      >
                        <Plus size={13} className="text-emerald-700 stroke-[3]" />
                        <span>Use custom address: &ldquo;{buildingSearch.trim()}&rdquo;</span>
                      </div>
                    )}

                    {/* Filtered Building & Client List */}
                    <div className="overflow-y-auto flex-1 space-y-0.5 divide-y divide-slate-100">
                      {filteredBuildings.length === 0 && !buildingSearch.trim() ? (
                        <div className="py-4 text-center text-[12px] text-slate-400">
                          No registered clients found
                        </div>
                      ) : (
                        filteredBuildings.map(item => {
                          const isSelected = address.toLowerCase() === item.building.toLowerCase()
                          return (
                            <div
                              key={item.key}
                              onClick={() => handleSelectClient(item.client, item.building)}
                              className={`px-3 py-2 rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between ${
                                isSelected ? 'bg-emerald-50/80 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5 flex-wrap truncate">
                                  <Building2 size={13} className="text-slate-400 shrink-0" />
                                  <span className="truncate">{item.building}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {item.clientName} {item.apartment ? `· Apt ${item.apartment}` : ''} {item.area ? `· ${item.area}` : ''}
                                </div>
                              </div>
                              {isSelected && <Check size={14} className="text-emerald-600 stroke-[3] shrink-0" />}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Area Dropdown with Suggestions & Custom Entry */}
              <div className="relative" ref={areaRef}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Location / Area
                </label>

                {/* Area Trigger Box */}
                <div
                  onClick={() => setAreaDropdownOpen(prev => !prev)}
                  className={`w-full flex items-center justify-between border rounded-xl transition-all cursor-pointer px-3.5 py-2 text-[13px] min-h-[42px] ${
                    areaDropdownOpen
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
                      : area
                        ? 'bg-purple-50/30 border-purple-300/80 text-slate-800 hover:border-purple-400'
                        : 'bg-[#f8fafc] border-[#E4E8EC] text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
                    <MapPin size={15} className={area ? 'text-purple-600 shrink-0' : 'text-slate-400 shrink-0'} />
                    {area ? (
                      <span className="font-bold text-slate-900 truncate">{area}</span>
                    ) : (
                      <span className="text-slate-400 truncate">Select or enter area…</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {area && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setArea('')
                        }}
                        className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                    <ChevronDown
                      size={15}
                      className={`text-slate-400 transition-transform duration-200 ${
                        areaDropdownOpen ? 'rotate-180 text-purple-600' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Area Dropdown Popover (flicker-free) */}
                {areaDropdownOpen && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    onMouseMove={e => e.stopPropagation()}
                    style={{ isolation: 'isolate' }}
                    className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-2 max-h-56 flex flex-col transition-none"
                  >
                    <div className="relative mb-2 shrink-0">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        ref={areaSearchInputRef}
                        type="text"
                        value={areaSearch}
                        onChange={e => setAreaSearch(e.target.value)}
                        placeholder="Search area (e.g. Marina, Downtown)…"
                        className="w-full text-[12.5px] pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-purple-500 focus:bg-white transition-all font-medium"
                      />
                    </div>

                    {areaSearch.trim() && (
                      <div
                        onClick={() => {
                          setArea(areaSearch.trim())
                          setAreaDropdownOpen(false)
                        }}
                        className="px-3 py-2 rounded-lg bg-purple-50 text-purple-900 hover:bg-purple-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0"
                      >
                        <Plus size={13} className="text-purple-700" />
                        <span>Use custom area: &ldquo;{areaSearch.trim()}&rdquo;</span>
                      </div>
                    )}

                    <div className="overflow-y-auto flex-1 space-y-0.5">
                      {filteredAreas.map(ar => {
                        const isSelected = area.toLowerCase() === ar.toLowerCase()
                        return (
                          <div
                            key={ar}
                            onClick={() => {
                              setArea(ar)
                              setAreaDropdownOpen(false)
                            }}
                            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between text-[12.5px] ${
                              isSelected ? 'bg-purple-50 text-purple-950 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'
                            }`}
                          >
                            <span className="truncate">{ar}</span>
                            {isSelected && <Check size={14} className="text-purple-600 stroke-[3] shrink-0" />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

        {/* CARD 3: Timing & Responsive Hours (12-Hour AM/PM Format & Auto Overtime) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 flex flex-col justify-start">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Clock size={15} />
              </div>
              <h4 className="text-[13px] font-bold text-slate-900">Timing & Duty Hours</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <Time12hPicker
                  label="Start Time"
                  value={startTime}
                  onChange={handleStartTimeChange}
                />
              </div>
              <div className="sm:col-span-5">
                <Time12hPicker
                  label="End Time"
                  value={endTime}
                  onChange={handleEndTimeChange}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 whitespace-nowrap text-center">
                  Duty Hrs
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={dutyHours}
                  onChange={e => handleDutyHoursChange(Number(e.target.value) || 0)}
                  className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-800 text-center"
                />
              </div>
            </div>
          </div>

        {/* CARD 4: Charges & Payment Mode */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 flex flex-col justify-start">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <CreditCard size={15} />
              </div>
              <h4 className="text-[13px] font-bold text-slate-900">Charges & Collection</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Charges (AED)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={charges}
                  onChange={e => setCharges(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Received (AED)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={received}
                  onChange={e => setReceived(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-bold text-emerald-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800 cursor-pointer"
                >
                  {PAYMENT_MODES.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
      </div>

      
      {/* ── CARD 5: CLEANING MATERIALS (HORIZONTAL ROW ACROSS FULL WIDTH) ── */}
      <div className="mt-4 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Package size={15} />
          </div>
          <h4 className="text-[13px] font-bold text-slate-900">Cleaning Materials</h4>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start pt-1">
          {/* 1. Material Dropdown */}
          <div className="space-y-1">
            {/* Cleaning Material Dropdown — Styled identical to CleanerMultiSelect with Tick/Cross for Custom Save */}
            <div className="relative" ref={materialRef}>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                <Package size={12} className="text-slate-400" />
                Cleaning Material / Supplies
              </label>

              {/* Material Trigger Box */}
              <div
                onClick={() => {
                  setMaterialDropdownOpen(prev => !prev)
                  setColorDropdownOpen(false)
                }}
                className={`w-full flex items-center justify-between border rounded-xl transition-all cursor-pointer px-3.5 py-2 text-[13px] min-h-[42px] ${
                  materialDropdownOpen
                    ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
                    : selectedMaterial !== 'No'
                      ? 'bg-amber-50/40 border-amber-300/80 text-slate-800 hover:border-amber-400'
                      : 'bg-[#f8fafc] border-[#E4E8EC] text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
                  <Package size={15} className={selectedMaterial !== 'No' ? 'text-amber-700 shrink-0' : 'text-slate-400 shrink-0'} />
                  <span className="font-bold text-slate-900 truncate">
                    {selectedMaterial === 'No' ? 'No Material (Client Supplies)' : selectedMaterial}
                  </span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-slate-400 transition-transform duration-200 shrink-0 ${
                    materialDropdownOpen ? 'rotate-180 text-amber-600' : ''
                  }`}
                />
              </div>

              {/* Material Dropdown Popover (Drop-Up Mode: Opens Upwards) */}
              {materialDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 bottom-full mb-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 animate-in fade-in slide-in-from-bottom-1 duration-150 max-h-64 flex flex-col">
                  {/* Preset & Custom Materials List */}
                  <div className="overflow-y-auto flex-1 space-y-0.5 divide-y divide-slate-100">
                    {materialsList.map(m => {
                      const isSelected = selectedMaterial === m
                      return (
                        <div
                          key={m}
                          onClick={() => {
                            setSelectedMaterial(m)
                            setMaterialDropdownOpen(false)
                            setIsAddingCustomMaterial(false)
                          }}
                          className={`px-3 py-2 rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between text-[12.5px] ${
                            isSelected ? 'bg-amber-50 text-amber-950 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'
                          }`}
                        >
                          <span>{m === 'No' ? 'No Material' : m}</span>
                          {isSelected && <Check size={14} className="text-amber-700 stroke-[3] shrink-0" />}
                        </div>
                      )
                    })}
                  </div>

                  {/* Add Custom Material Section with Tick & Cross Icons */}
                  <div className="pt-2 mt-1 border-t border-slate-100 shrink-0">
                    {!isAddingCustomMaterial ? (
                      <button
                        type="button"
                        onClick={() => setIsAddingCustomMaterial(true)}
                        className="w-full py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 text-[12px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus size={13} className="text-emerald-700 stroke-[2.5]" />
                        <span>Add Custom Material…</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                        <input
                          ref={customMaterialInputRef}
                          type="text"
                          value={customMaterialInput}
                          onChange={e => setCustomMaterialInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveCustomMaterial()
                            } else if (e.key === 'Escape') {
                              handleCancelCustomMaterial()
                            }
                          }}
                          placeholder="Type custom material (e.g. Steam Cleaner)…"
                          className="flex-1 text-[12px] px-2.5 py-1.5 border border-emerald-400 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-900"
                        />
                        {/* Tick button to save immediately */}
                        <button
                          type="button"
                          onClick={handleSaveCustomMaterial}
                          title="Save Custom Material"
                          className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
                        >
                          <Check size={14} className="stroke-[3]" />
                        </button>
                        {/* Cross button to cancel */}
                        <button
                          type="button"
                          onClick={handleCancelCustomMaterial}
                          title="Cancel"
                          className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <X size={14} className="stroke-[2.5]" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Shift Remarks */}
          <div className="space-y-1">
            {/* Shift Remarks */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                <FileText size={12} className="text-slate-400" />
                Shift Remarks & Notes
              </label>
              <input
                name="remarks"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g. Balcony wash, Sofa shampoo, Key with security, Online payment…"
                className="w-full text-[13px] px-3.5 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
              />
            </div>
          </div>

          {/* 3. Row Color Theme Dropdown (Drop-Up Mode) */}
          <div className="space-y-1">
            <div className="relative" ref={colorRef}>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                <Palette size={12} className="text-slate-400" />
                Row Color Theme
              </label>

              {/* Row Color Trigger Box */}
              <div
                onClick={() => {
                  setColorDropdownOpen(prev => !prev)
                  setMaterialDropdownOpen(false)
                }}
                className={`w-full flex items-center justify-between border rounded-xl transition-all cursor-pointer px-3.5 py-2 text-[13px] min-h-[42px] ${
                  colorDropdownOpen
                    ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
                    : rowColor !== 'default'
                      ? 'bg-emerald-50/40 border-emerald-300/80 text-slate-800 hover:border-emerald-400'
                      : 'bg-[#f8fafc] border-[#E4E8EC] text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
                  <span
                    className="w-4 h-4 rounded-full border border-black/15 shrink-0 shadow-2xs flex items-center justify-center"
                    style={{ backgroundColor: selectedColorPreset?.circleColor || '#f1f5f9' }}
                  />
                  <span className="font-bold text-slate-900 truncate">
                    {selectedColorPreset?.label ? selectedColorPreset.label.replace('Soft ', '') : 'Default'}
                  </span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-slate-400 transition-transform duration-200 shrink-0 ${
                    colorDropdownOpen ? 'rotate-180 text-emerald-600' : ''
                  }`}
                />
              </div>

              {/* Color Dropdown Popover (Drop-Up Mode: Opens Upwards) */}
              {colorDropdownOpen && (
                <div className="absolute z-50 right-0 bottom-full mb-1.5 w-full sm:w-[320px] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-1 duration-150 flex flex-col">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Palette size={12} className="text-slate-400" />
                      Select Row Color ({ROW_COLOR_PRESETS.length})
                    </span>
                    {rowColor !== 'default' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRowColor('default')
                          setColorDropdownOpen(false)
                        }}
                        className="text-[10.5px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto pr-1 grid grid-cols-2 gap-1.5 [scrollbar-width:thin]">
                    {ROW_COLOR_PRESETS.map(preset => {
                      const isSelected = rowColor === preset.id
                      const cleanName = preset.label.replace('Soft ', '')
                      return (
                        <button
                          type="button"
                          key={preset.id}
                          onClick={() => {
                            setRowColor(preset.id)
                            setColorDropdownOpen(false)
                          }}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer text-left ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold shadow-xs ring-2 ring-emerald-500/20'
                              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0 shadow-2xs flex items-center justify-center"
                            style={{ backgroundColor: preset.circleColor }}
                          >
                            {isSelected && <Check size={8} className="text-slate-900 stroke-[3.5]" />}
                          </span>
                          <span className="truncate flex-1">{cleanName}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Client Registration Modal ── */}
      <QuickNewClientModal
        open={showQuickClientModal}
        onClose={() => {
          setShowQuickClientModal(false)
          setHasConfirmedUnregistered(true)
        }}
        initialName={unregisteredClientName}
        initialBuilding={unregisteredClientName}
        initialArea={area}
        onClientRegistered={(newClient) => {
          setAddress(newClient.building_name || newClient.full_name)
          if (newClient.area) setArea(newClient.area)
          setHasConfirmedUnregistered(true)
        }}
      />
    </form>
  )
}
