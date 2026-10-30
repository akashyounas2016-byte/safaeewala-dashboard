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

export function AddJobForm({
  employees,
  onSave,
  onClose,
  initial,
  existingJobsForDate = [],
}: AddJobFormProps) {
  const { clients } = useData()

  // ── Staff & Team State ──
  const [selectedStaff, setSelectedStaff] = useState<string[]>(() => {
    if (!initial?.staff_name) return []
    return initial.staff_name.split(/[,+/&]|\band\b/i).map(s => s.trim()).filter(Boolean)
  })

  // ── Date ──
  const [date, setDate] = useState(() => initial?.date || todayDubai())

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

  // ── Timing & Duration ──
  const [startTime, setStartTime] = useState(initial?.start_time || '09:00')
  const [endTime, setEndTime]     = useState(initial?.end_time || '13:00')
  const [dutyHours, setDutyHours] = useState<number>(() => {
    if (initial?.duty_hours) return Number(initial.duty_hours)
    return calcHours(initial?.start_time || '09:00', initial?.end_time || '13:00') || 4
  })
  const [otHours, setOtHours]     = useState<number | string>(() => {
    if (initial?.ot_hours !== undefined) return initial.ot_hours
    return calcOTHours(initial?.start_time || '09:00', initial?.end_time || '13:00')
  })
  const [isOvertime, setIsOvertime] = useState(Boolean(initial?.is_overtime || Number(otHours) > 0))

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    if (newStart && dutyHours > 0) {
      const calculatedEnd = addHoursToTime(newStart, dutyHours)
      setEndTime(calculatedEnd)
      const calculatedOT = calcOTHours(newStart, calculatedEnd)
      setOtHours(calculatedOT)
      if (calculatedOT > 0) setIsOvertime(true)
    }
  }

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    if (startTime && newEnd) {
      const duration = calcDurationFromTimes(startTime, newEnd)
      if (duration > 0) {
        setDutyHours(duration)
        const calculatedOT = calcOTHours(startTime, newEnd)
        setOtHours(calculatedOT)
        if (calculatedOT > 0) setIsOvertime(true)
      }
    }
  }

  const handleDutyHoursChange = (newDuty: number) => {
    setDutyHours(newDuty)
    if (startTime && newDuty > 0) {
      const calculatedEnd = addHoursToTime(startTime, newDuty)
      setEndTime(calculatedEnd)
      const calculatedOT = calcOTHours(startTime, calculatedEnd)
      setOtHours(calculatedOT)
      if (calculatedOT > 0) setIsOvertime(true)
    }
  }

  // ── Financials ──
  const [charges, setCharges] = useState<number | string>(initial?.charges ?? '')
  const [received, setReceived] = useState<number | string>(initial?.received ?? '')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial?.payment_mode ?? 'Cash')

  // ── Row Color Preset (18 options with View All) ──
  const [rowColor, setRowColor] = useState<string>(initial?.row_color || 'default')
  const [showAllColors, setShowAllColors] = useState(false)

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
      client: Client
    }[] = []
    const seen = new Set<string>()

    clients.forEach(c => {
      const bName = c.building_name?.trim() || ''
      const name = c.full_name?.trim() || ''
      const key = `${bName}___${name}`
      if (!seen.has(key)) {
        seen.add(key)
        list.push({
          key: c.id,
          building: bName || name,
          clientName: name,
          area: c.area || '',
          apartment: c.apartment || '',
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
          const parts = j.staff_name.toLowerCase().split(/[,\+]/).map(s => s.trim())
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

  // Presets to display (show 10 initially = 2 rows, or all 18 when expanded)
  const displayedColorPresets = showAllColors ? ROW_COLOR_PRESETS : ROW_COLOR_PRESETS.slice(0, 10)

  return (
    <form id="add-job-entry-form" onSubmit={handleSubmit} className="text-slate-800">
      {/* ── TOP 4 CARDS: 2x2 EQUAL BALANCED GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* CARD 1: Staff, Team & Date */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Users size={15} />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-slate-900">Staff & Schedule</h4>
                  <p className="text-[11px] text-slate-500">Assign cleaner(s) and duty date</p>
                </div>
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
                  label="Staff Name / Cleaners"
                  name="staff_name"
                  cleaners={employees}
                  selected={selectedStaff}
                  onChange={setSelectedStaff}
                  placeholder="Select cleaner(s)…"
                  required
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

            {/* Conditional Multi-Cleaner Team Field */}
            {selectedStaff.length >= 2 && (
              <div className="pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={12} className="text-indigo-600" />
                    Team Reference <span className="text-slate-400 font-normal lowercase">(auto-generated)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTeamName(defaultTeamName)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="e.g. Team A, Team Alpha…"
                    className="w-full text-[13px] px-3.5 py-2 min-h-[40px] border border-indigo-200 rounded-xl bg-indigo-50/40 text-indigo-950 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                  />
                  <span className="absolute right-2.5 top-2 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Lead: {selectedStaff[0]}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 mt-1">
                  Received payment recorded under <b>{selectedStaff[0]}</b>; others display reference <b>{teamName || defaultTeamName}</b>.
                </p>
              </div>
            )}
          </div>

        {/* CARD 2: Address & Location (Improved Building & Area Dropdowns matching Staff Name style) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                <MapPin size={15} />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-slate-900">Address & Location</h4>
                <p className="text-[11px] text-slate-500">Center-aligned building selector and community area</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">

              {/* Building Dropdown — Styled identical to CleanerMultiSelect */}
              <div className="relative" ref={buildingRef}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between">
                  <span>Building / Client</span>
                  <span className="text-red-500">*</span>
                </label>

                {/* Building Trigger Box */}
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
                      <span className="text-slate-400 truncate">Select or enter building…</span>
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

                {/* Building Dropdown Popover */}
                {buildingDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-2 animate-in fade-in slide-in-from-top-1 duration-150 max-h-64 flex flex-col">
                    {/* Search Bar */}
                    <div className="relative mb-2 shrink-0">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        ref={buildingSearchInputRef}
                        type="text"
                        value={buildingSearch}
                        onChange={e => setBuildingSearch(e.target.value)}
                        placeholder="Search building or client…"
                        className="w-full text-[12.5px] pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-medium"
                      />
                    </div>

                    {/* Custom Value Option if typing custom building / new client */}
                    {buildingSearch.trim() && (
                      <div
                        onClick={() => {
                          const val = buildingSearch.trim()
                          setAddress(val)
                          setBuildingDropdownOpen(false)
                          const isReg = clients.some(c =>
                            c.full_name?.toLowerCase().trim() === val.toLowerCase() ||
                            c.building_name?.toLowerCase().trim() === val.toLowerCase()
                          )
                          if (!isReg) {
                            setUnregisteredClientName(val)
                            setShowQuickClientModal(true)
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0"
                      >
                        <Plus size={13} className="text-emerald-700" />
                        <span>Use custom / register client: &ldquo;{buildingSearch.trim()}&rdquo;</span>
                      </div>
                    )}

                    {/* Filtered Building & Client List */}
                    <div className="overflow-y-auto flex-1 space-y-0.5 divide-y divide-slate-100">
                      {filteredBuildings.length === 0 && !buildingSearch.trim() ? (
                        <div className="py-4 text-center text-[12px] text-slate-400">
                          No clients or buildings found
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
                                <div className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5 truncate">
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

              {/* Area Dropdown with Suggestions & Custom Entry — Styled identical to CleanerMultiSelect */}
              <div className="relative" ref={areaRef}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between">
                  <span>Location / Area</span>
                  <span className="text-slate-400 text-[10px] normal-case">Dubai Zone</span>
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

                {/* Area Dropdown Popover */}
                {areaDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-2 animate-in fade-in slide-in-from-top-1 duration-150 max-h-60 flex flex-col">
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

        {/* CARD 3: Timing & Responsive Hours */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Clock size={15} />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-slate-900">Timing & Duty Hours</h4>
                  <p className="text-[11px] text-slate-500">Auto-synchronized shift duration and overtime</p>
                </div>
              </div>
              {Number(otHours) > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                  +{otHours}h OT
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1 flex items-center justify-between">
                  <span>Start</span>
                  <span className="text-blue-600 font-bold normal-case">{formatTime12h(startTime)}</span>
                </label>
                <input
                  type="time"
                  value={formatTime24h(startTime)}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className="w-full text-[13px] px-2.5 py-2 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1 flex items-center justify-between">
                  <span>End</span>
                  <span className="text-blue-600 font-bold normal-case">{formatTime12h(endTime)}</span>
                </label>
                <input
                  type="time"
                  value={formatTime24h(endTime)}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className="w-full text-[13px] px-2.5 py-2 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1">
                  Duty Hrs
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={dutyHours}
                  onChange={e => handleDutyHoursChange(Number(e.target.value) || 0)}
                  className="w-full text-[13px] px-2.5 py-2 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1 flex items-center justify-between">
                  <span>OT Hrs</span>
                  <span className="text-[9.5px] text-slate-400">R-OT-01</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={otHours}
                  onChange={e => {
                    const val = e.target.value
                    setOtHours(val)
                    setIsOvertime(Number(val) > 0)
                  }}
                  placeholder="0.0"
                  className="w-full text-[13px] px-2.5 py-2 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-amber-500 focus:bg-white transition-all font-bold text-amber-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5 text-[11.5px] text-slate-600">
              <input
                type="checkbox"
                id="add_job_modal_is_overtime"
                checked={isOvertime}
                onChange={e => setIsOvertime(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
              />
              <label htmlFor="add_job_modal_is_overtime" className="font-semibold cursor-pointer text-slate-700">
                Mark Shift as Overtime (OT)
              </label>
              <span className="text-slate-400">· Shifts &gt;8h or post-8 PM auto-count as OT</span>
            </div>
          </div>

        {/* CARD 4: Charges & Payment Mode */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 h-full flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <CreditCard size={15} />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-slate-900">Charges & Collection</h4>
                <p className="text-[11px] text-slate-500">Service billing and payment status</p>
              </div>
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

      
      {/* ── CARD 5: CUSTOMIZATION & SUPPLIES (HORIZONTAL ROW ACROSS FULL WIDTH) ── */}
      <div className="mt-4 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Palette size={15} />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-slate-900">Customization & Supplies</h4>
            <p className="text-[11px] text-slate-500">Row highlight colors, cleaning supplies and shift remarks</p>
          </div>
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
                onClick={() => setMaterialDropdownOpen(prev => !prev)}
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

              {/* Material Dropdown Popover */}
              {materialDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-2 animate-in fade-in slide-in-from-top-1 duration-150 max-h-64 flex flex-col">
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
                className="w-full text-[13px] px-3.5 py-2 min-h-[40px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
              />
            </div>
          </div>

          {/* 3. Row Color Theme */}
          <div className="space-y-1">
            {/* Row Highlight Color Picker (18 presets, initially 2 rows, with "View All" toggle) */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] flex items-center gap-1.5">
                  <Palette size={12} className="text-slate-400" />
                  Row Color Theme ({ROW_COLOR_PRESETS.length} Options)
                </label>
                {/* View All / Show Less Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowAllColors(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                >
                  <span>{showAllColors ? 'Show Less' : `View All (${ROW_COLOR_PRESETS.length})`}</span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showAllColors ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Color badges grid */}
              <div className="flex items-center gap-2 flex-wrap">
                {displayedColorPresets.map(preset => {
                  const isSelected = rowColor === preset.id
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => setRowColor(preset.id)}
                      title={preset.label}
                      className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer text-[11.5px] font-semibold ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0 shadow-2xs flex items-center justify-center"
                        style={{ backgroundColor: preset.circleColor }}
                      >
                        {isSelected && <Check size={9} className="text-slate-900 stroke-[3.5]" />}
                      </span>
                      <span>{preset.label.replace('Soft ', '')}</span>
                    </button>
                  )
                })}
              </div>
          </div>
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
