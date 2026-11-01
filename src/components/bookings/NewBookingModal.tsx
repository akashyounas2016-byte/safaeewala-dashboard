import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { QuickNewClientModal } from '@/components/common/QuickNewClientModal'
import { Time12hPicker, parseTimeToMinutes } from '@/components/common/Time12hPicker'
import { useData } from '@/store/DataContext'
import type { Booking, BookingFrequency, BookingStatus, Client, MaterialType } from '@/types'
import {
  ROW_COLOR_PRESETS,
  formatTime12h,
} from '@/components/dailyJobSheet/jobSheetUtils'
import { cleanAddressDisplay } from '@/lib/utils'
import { todayDubai } from '@/lib/dubaiTime'
import { staffNameToCrew, getDayNameFromDate } from '@/lib/clientDataSync'
import { notify } from '@/lib/notify'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
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

export interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onAdd: (booking: Omit<Booking, 'id' | 'created_at'> & { recurring_days?: string[] }) => void
}

/* ─── Default Cleaning Services ─── */
export const DEFAULT_CLEANING_SERVICES = [
  'Standard / General Cleaning',
  'Deep Cleaning',
  'Move-in / Move-out Cleaning',
  'Post-Construction Cleaning',
  'Office / Commercial Cleaning',
  'Sofa & Upholstery Shampooing',
  'Carpet Deep Cleaning',
  'Mattress Sanitization',
  'Window & Glass Cleaning',
  'Kitchen Deep Cleaning',
  'Bathroom Sanitization & Descaling',
  'Balcony / Outdoor Pressure Wash',
  'Villa / Townhouse Deep Clean',
  'Airbnb / Holiday Home Turnover',
  'AC Duct & Coil Cleaning',
  'Disinfection & Sanitization',
]

const DUBAI_AREAS = [
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

const DEFAULT_PRESET_MATERIALS = [
  'No',
  'Yes',
  'Chemicals Only',
  'Machines Only',
  'Sofa Kit',
  'Ladder',
]

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function NewBookingModal({ open, onClose, onAdd }: NewBookingModalProps) {
  const { clients, employees, dailyJobs, bookings } = useData()

  // ── Form State ──
  // Card 1: Staff & Schedule
  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  const [scheduledDate, setScheduledDate] = useState(() => todayDubai())
  const [teamName, setTeamName] = useState('')
  const [frequency, setFrequency] = useState<BookingFrequency>('once')
  const [selectedDays, setSelectedDays] = useState<string[]>([])

  // Card 2: Address & Location
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientName, setClientName] = useState('')
  const [buildingDropdownOpen, setBuildingDropdownOpen] = useState(false)
  const [buildingSearch, setBuildingSearch] = useState('')
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false)
  const [areaSearch, setAreaSearch] = useState('')
  const [showQuickClientModal, setShowQuickClientModal] = useState(false)
  const [unregisteredClientName, setUnregisteredClientName] = useState('')

  // Card 3: Timing & Duty Hours
  const [startTime, setStartTime] = useState('09:00 AM')
  const [endTime, setEndTime] = useState('01:00 PM')
  const [dutyHours, setDutyHours] = useState(4)

  // Card 4: Charges & Booking Details
  const [totalAmount, setTotalAmount] = useState<number | ''>('')
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('confirmed')
  const [serviceType, setServiceType] = useState('Standard / General Cleaning')
  const [customServiceName, setCustomServiceName] = useState('')
  const [isCustomService, setIsCustomService] = useState(false)
  const [serviceTypesList, setServiceTypesList] = useState<string[]>(() => {
    return safeLocalStorageGet('safaeewala_booking_service_types', DEFAULT_CLEANING_SERVICES)
  })

  // Card 5: Cleaning Materials & Notes & Row Color Theme
  const [selectedMaterial, setSelectedMaterial] = useState<string>('No')
  const [materialsList, setMaterialsList] = useState<string[]>(() => {
    return safeLocalStorageGet('safaeewala_job_materials', DEFAULT_PRESET_MATERIALS)
  })
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false)
  const [isAddingCustomMaterial, setIsAddingCustomMaterial] = useState(false)
  const [customMaterialInput, setCustomMaterialInput] = useState('')
  const [remarks, setRemarks] = useState('')
  const [rowColor, setRowColor] = useState('default')
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false)

  // ── Refs for Click-Outside ──
  const buildingRef = useRef<HTMLDivElement>(null)
  const buildingSearchInputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const areaSearchInputRef = useRef<HTMLInputElement>(null)
  const materialRef = useRef<HTMLDivElement>(null)
  const customMaterialInputRef = useRef<HTMLInputElement>(null)
  const colorRef = useRef<HTMLDivElement>(null)

  // Auto-set team name when 2+ cleaners selected
  const defaultTeamName = useMemo(() => {
    if (selectedStaff.length >= 2) return `Team ${selectedStaff[0]?.split(' ')[0] || 'Alpha'}`
    return ''
  }, [selectedStaff])

  useEffect(() => {
    if (selectedStaff.length >= 2 && !teamName) {
      setTeamName(defaultTeamName)
    }
  }, [selectedStaff, teamName, defaultTeamName])

  // Click-outside handlers
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (buildingRef.current && !buildingRef.current.contains(target)) setBuildingDropdownOpen(false)
      if (areaRef.current && !areaRef.current.contains(target)) setAreaDropdownOpen(false)
      if (materialRef.current && !materialRef.current.contains(target)) {
        setMaterialDropdownOpen(false)
        setIsAddingCustomMaterial(false)
      }
      if (colorRef.current && !colorRef.current.contains(target)) setColorDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  useEffect(() => {
    if (buildingDropdownOpen) setTimeout(() => buildingSearchInputRef.current?.focus(), 50)
  }, [buildingDropdownOpen])
  useEffect(() => {
    if (areaDropdownOpen) setTimeout(() => areaSearchInputRef.current?.focus(), 50)
  }, [areaDropdownOpen])
  useEffect(() => {
    if (isAddingCustomMaterial) setTimeout(() => customMaterialInputRef.current?.focus(), 50)
  }, [isAddingCustomMaterial])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedStaff([])
      setScheduledDate(todayDubai())
      setTeamName('')
      setFrequency('once')
      setSelectedDays([])
      setAddress('')
      setArea('')
      setSelectedClientId('')
      setClientPhone('')
      setClientName('')
      setBuildingSearch('')
      setAreaSearch('')
      setStartTime('09:00')
      setEndTime('13:00')
      setDutyHours(4)
      setTotalAmount('')
      setBookingStatus('confirmed')
      setServiceType('Standard / General Cleaning')
      setCustomServiceName('')
      setIsCustomService(false)
      setSelectedMaterial('No')
      setRemarks('')
      setRowColor('default')
      setBuildingDropdownOpen(false)
      setAreaDropdownOpen(false)
      setMaterialDropdownOpen(false)
      setColorDropdownOpen(false)
    }
  }, [open])

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
          building: cleanAddressDisplay(bName || name),
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
      b.apartment.toLowerCase().includes(q) ||
      b.area.toLowerCase().includes(q)
    )
  }, [buildingOptions, buildingSearch])

  // Common Dubai Areas
  const allAreas = useMemo(() => {
    const set = new Set<string>(DUBAI_AREAS)
    clients.forEach(c => { if (c.area?.trim()) set.add(c.area.trim()) })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [clients])

  const filteredAreas = useMemo(() => {
    const q = areaSearch.trim().toLowerCase()
    if (!q) return allAreas
    return allAreas.filter(a => a.toLowerCase().includes(q))
  }, [allAreas, areaSearch])

  // Track busy cleaners on the scheduled date
  const busyCleanersMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!scheduledDate) return map

    // 1. Daily jobs
    ;(dailyJobs || []).forEach(j => {
      if (j.date === scheduledDate && j.staff_name) {
        const parts = j.staff_name.split(/[,+]/).map(s => s.trim())
        parts.forEach(p => {
          if (!map.has(p)) {
            const timeDesc = j.start_time && j.end_time ? `${j.start_time}-${j.end_time}` : 'Scheduled'
            map.set(p, timeDesc)
          }
        })
      }
    })

    // 2. Bookings
    ;(bookings || []).forEach(b => {
      if (b.scheduled_date === scheduledDate && b.status !== 'cancelled' && Array.isArray(b.assigned_crew)) {
        b.assigned_crew.forEach(empId => {
          const emp = employees.find(e => e.id === empId)
          if (emp && !map.has(emp.full_name)) {
            const timeDesc = b.scheduled_time && b.end_time ? `${b.scheduled_time}-${b.end_time}` : 'Booked'
            map.set(emp.full_name, timeDesc)
          }
        })
      }
    })

    return map
  }, [scheduledDate, dailyJobs, bookings, employees])

  // ── Time & Duty Hours Calculation ──
  const calcDuration = (start: string, end: string): number => {
    const s = parseTimeToMinutes(start)
    const e = parseTimeToMinutes(end)
    if (s === null || e === null) return 4
    let diff = e - s
    if (diff < 0) diff += 24 * 60
    return Math.max(0.5, Math.round((diff / 60) * 10) / 10)
  }

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    const sMins = parseTimeToMinutes(newStart)
    if (sMins !== null) {
      const targetEndMins = (sMins + Math.round(dutyHours * 60)) % (24 * 60)
      const h24 = Math.floor(targetEndMins / 60)
      const m = String(targetEndMins % 60).padStart(2, '0')
      setEndTime(`${String(h24).padStart(2, '0')}:${m}`)
    }
  }

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    const d = calcDuration(startTime, newEnd)
    setDutyHours(d)
  }

  const handleDutyHoursChange = (h: number) => {
    const val = Math.max(0.5, Math.min(24, h))
    setDutyHours(val)
    const sMins = parseTimeToMinutes(startTime)
    if (sMins !== null) {
      const targetEndMins = (sMins + Math.round(val * 60)) % (24 * 60)
      const h24 = Math.floor(targetEndMins / 60)
      const m = String(targetEndMins % 60).padStart(2, '0')
      setEndTime(`${String(h24).padStart(2, '0')}:${m}`)
    }
  }

  // Client Selection
  const handleSelectClient = (c: Client, building: string) => {
    const cleanB = cleanAddressDisplay(building)
    setAddress(cleanB)
    setSelectedClientId(c.id)
    setClientName(c.full_name)
    setClientPhone(c.whatsapp || c.phone || '')
    if (c.area) setArea(c.area)
    setBuildingDropdownOpen(false)
  }

  // Custom Material Save
  const handleSaveCustomMaterial = () => {
    const clean = customMaterialInput.trim()
    if (!clean) {
      setIsAddingCustomMaterial(false)
      return
    }
    if (!materialsList.includes(clean)) {
      const updated = [...materialsList, clean]
      setMaterialsList(updated)
      safeLocalStorageSet('safaeewala_job_materials', updated)
    }
    setSelectedMaterial(clean)
    setCustomMaterialInput('')
    setIsAddingCustomMaterial(false)
    setMaterialDropdownOpen(false)
  }

  const handleCancelCustomMaterial = () => {
    setCustomMaterialInput('')
    setIsAddingCustomMaterial(false)
  }

  // Toggle day for monthly recurring
  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  // Selected color preset for trigger display
  const selectedColorPreset = useMemo(() => {
    return ROW_COLOR_PRESETS.find(p => p.id === rowColor) || ROW_COLOR_PRESETS[0]
  }, [rowColor])

  // ── Submit Handler ──
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!address.trim()) {
      notify.error('Please enter or select a service address.')
      return
    }
    if (!scheduledDate) {
      notify.error('Please select a scheduled date.')
      return
    }

    const finalClientName = clientName.trim() || cleanAddressDisplay(address.trim())
    const assignedCrewIds = staffNameToCrew(selectedStaff.join(', '), employees)

    const finalService = isCustomService
      ? (customServiceName.trim() || 'Custom Cleaning')
      : serviceType

    onAdd({
      client_name: finalClientName,
      client_phone: clientPhone.trim(),
      client_id: selectedClientId || '',
      service_address: cleanAddressDisplay(address.trim()),
      service_type: finalService,
      frequency,
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time: endTime,
      duration_hours: dutyHours,
      material: (selectedMaterial === 'No' ? 'No' : 'Yes') as MaterialType,
      total_amount: typeof totalAmount === 'number' ? totalAmount : Number(totalAmount) || 0,
      status: bookingStatus,
      assigned_crew: assignedCrewIds,
      notes: remarks.trim(),
      recurring_days: frequency === 'monthly' ? (selectedDays.length > 0 ? selectedDays : [getDayNameFromDate(scheduledDate)]) : undefined,
      ...(rowColor !== 'default' ? { row_color: rowColor } : {}),
    } as any)

    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Booking"
      size="5xl"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-[12.5px] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-booking-entry-form"
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[12.5px] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus size={15} className="stroke-[3]" />
            <span>Save Booking</span>
          </button>
        </div>
      }
    >
      <form id="add-booking-entry-form" onSubmit={handleSubmit} className="text-slate-800 p-1 sm:p-2">
        {/* ── TOP 4 CARDS: 2x2 EQUAL BALANCED 50/50 GRID ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

          {/* CARD 1: Staff, Team & Schedule (50% Width) */}
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
                  busyCleaners={new Map(Array.from(busyCleanersMap, ([name, info]) => [name.toLowerCase(), { info }]))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Job Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  required
                  className="w-full text-[13px] px-3.5 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800"
                />
              </div>
            </div>

            {/* Multi-Cleaner Team Field */}
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
                <input
                  type="text"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="e.g. Team A, Team Alpha…"
                  className="w-full text-[12.5px] px-3 py-1.5 min-h-[38px] border border-indigo-200 rounded-xl bg-indigo-50/40 text-indigo-950 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>
            )}

            {/* Booking Frequency & Service Days */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
                  Booking Frequency
                </label>
                <select
                  value={frequency}
                  onChange={e => setFrequency(e.target.value as BookingFrequency)}
                  className="text-[12px] px-2.5 py-1 border border-slate-200 rounded-lg bg-slate-50 font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="once">One-time Service</option>
                  <option value="weekly">Weekly Recurring</option>
                  <option value="biweekly">Bi-weekly Recurring</option>
                  <option value="monthly">Monthly Recurring (Job Sheet Sync)</option>
                </select>
              </div>

              {frequency === 'monthly' && (
                <div className="p-2 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-1.5">
                  <span className="text-[10.5px] font-bold text-emerald-900 block">Select Recurring Days:</span>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEK_DAYS.map(d => {
                      const active = selectedDays.includes(d)
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={`text-[10px] py-1 rounded-lg font-bold transition-all cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-white text-slate-600 hover:bg-emerald-100/70 border border-emerald-200'
                          }`}
                        >
                          {d.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD 2: Address & Location (50% Width) */}
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
                      <span className="font-bold text-slate-900 truncate">{cleanAddressDisplay(address)}</span>
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
                          setSelectedClientId('')
                          setClientName('')
                          setClientPhone('')
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

                {/* Address Dropdown Popover */}
                {buildingDropdownOpen && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    onMouseMove={e => e.stopPropagation()}
                    style={{ isolation: 'isolate' }}
                    className="absolute z-50 left-0 w-full min-w-[380px] sm:min-w-[440px] max-w-xl mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 max-h-64 flex flex-col transition-none"
                  >
                    {/* Search Bar */}
                    <div className="relative mb-2 shrink-0">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        ref={buildingSearchInputRef}
                        type="text"
                        value={buildingSearch}
                        onChange={e => setBuildingSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const trimmed = buildingSearch.trim()
                            if (trimmed) {
                              const match = filteredBuildings.find(
                                b => b.building.toLowerCase() === trimmed.toLowerCase()
                              )
                              if (match) {
                                handleSelectClient(match.client, match.building)
                              } else {
                                setAddress(cleanAddressDisplay(trimmed))
                                setUnregisteredClientName(trimmed)
                                setShowQuickClientModal(true)
                                setBuildingDropdownOpen(false)
                              }
                            }
                          }
                        }}
                        placeholder="Search address or client…"
                        className="w-full text-[12.5px] pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-medium"
                      />
                    </div>

                    {/* Custom Value Option -> Opens Quick Client Registration Modal */}
                    {buildingSearch.trim() && (
                      <div
                        onClick={() => {
                          const val = buildingSearch.trim()
                          setAddress(cleanAddressDisplay(val))
                          setUnregisteredClientName(val)
                          setShowQuickClientModal(true)
                          setBuildingDropdownOpen(false)
                        }}
                        className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-900 hover:bg-emerald-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0"
                      >
                        <Plus size={13} className="text-emerald-700 stroke-[3]" />
                        <span>Add New Client: &ldquo;{cleanAddressDisplay(buildingSearch.trim())}&rdquo; (Save WhatsApp & Details)</span>
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
                          const cleanItemBuilding = cleanAddressDisplay(item.building)
                          const isSelected = address.toLowerCase() === cleanItemBuilding.toLowerCase()
                          return (
                            <div
                              key={item.key}
                              onClick={() => handleSelectClient(item.client, cleanItemBuilding)}
                              className={`px-3 py-2 rounded-lg transition-colors cursor-pointer text-left flex items-center justify-between ${
                                isSelected ? 'bg-emerald-50/80 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5 flex-wrap truncate">
                                  <Building2 size={13} className="text-slate-400 shrink-0" />
                                  <span className="truncate">{cleanItemBuilding}</span>
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

              {/* Area Dropdown */}
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

                {/* Area Dropdown Popover */}
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

            {/* Client Phone Info Display */}
            {clientPhone && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Client Contact: <span className="font-bold text-slate-700">{clientPhone}</span></span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Linked</span>
              </div>
            )}
          </div>

          {/* CARD 3: Timing & Duty Hours (50% Width) */}
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

          {/* CARD 4: Charges & Booking Details (50% Width) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5 flex flex-col justify-start">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <CreditCard size={15} />
              </div>
              <h4 className="text-[13px] font-bold text-slate-900">Charges & Booking Details</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Total Amount (AED)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                  Booking Status
                </label>
                <select
                  value={bookingStatus}
                  onChange={e => setBookingStatus(e.target.value as BookingStatus)}
                  className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800 cursor-pointer"
                >
                  <option value="confirmed">Scheduled (Confirmed)</option>
                  <option value="pending">Pending Confirmation</option>
                  <option value="in_progress">Live Now (In Progress)</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
                    Service Type
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomService(prev => !prev)}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    {isCustomService ? 'Choose Standard' : '+ Custom'}
                  </button>
                </div>
                {isCustomService ? (
                  <input
                    type="text"
                    value={customServiceName}
                    onChange={e => setCustomServiceName(e.target.value)}
                    placeholder="e.g. Marble Polish…"
                    className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-emerald-300 rounded-xl bg-emerald-50/30 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800"
                  />
                ) : (
                  <select
                    value={serviceType}
                    onChange={e => setServiceType(e.target.value)}
                    className="w-full text-[13px] px-3 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800 cursor-pointer truncate"
                  >
                    {serviceTypesList.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 5: CLEANING MATERIALS & NOTES & ROW COLOR THEME (FULL WIDTH ROW) ── */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Package size={15} />
            </div>
            <h4 className="text-[13px] font-bold text-slate-900">Cleaning Materials & Notes</h4>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start pt-1">
            {/* 1. Material Dropdown */}
            <div className="space-y-1">
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

                {/* Material Dropdown Popover (Drop-Up Mode) */}
                {materialDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 bottom-full mb-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 animate-in fade-in slide-in-from-bottom-1 duration-150 max-h-64 flex flex-col">
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

                    {/* Add Custom Material Section */}
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
                            placeholder="Type custom material…"
                            className="flex-1 text-[12px] px-2.5 py-1.5 border border-emerald-400 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={handleSaveCustomMaterial}
                            title="Save Custom Material"
                            className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
                          >
                            <Check size={14} className="stroke-[3]" />
                          </button>
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

            {/* 2. Shift Remarks & Special Notes */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                <FileText size={12} className="text-slate-400" />
                Shift Remarks & Notes
              </label>
              <input
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g. Balcony wash, Sofa shampoo, Key with security, Online payment…"
                className="w-full text-[13px] px-3.5 py-2 min-h-[42px] border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
              />
            </div>

            {/* 3. Row Color Theme Dropdown */}
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

                {/* Color Dropdown Popover */}
                {colorDropdownOpen && (
                  <div className="absolute z-50 right-0 bottom-full mb-1.5 w-full sm:w-[320px] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-1 duration-150 flex flex-col">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Palette size={12} className="text-slate-400" />
                        Select Row Theme
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRowColor('default')
                          setColorDropdownOpen(false)
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="max-h-56 overflow-y-auto grid grid-cols-2 gap-1.5 pr-0.5">
                      {ROW_COLOR_PRESETS.map(preset => {
                        const isSelected = rowColor === preset.id
                        return (
                          <div
                            key={preset.id}
                            onClick={() => {
                              setRowColor(preset.id)
                              setColorDropdownOpen(false)
                            }}
                            className={`flex items-center gap-2 p-1.5 rounded-xl border text-[11.5px] cursor-pointer transition-all ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50/80 font-bold text-emerald-950 shadow-2xs'
                                : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                              style={{ backgroundColor: preset.circleColor || '#cbd5e1' }}
                            />
                            <span className="truncate">{preset.label.replace('Soft ', '')}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Quick Client Registration Modal */}
      <QuickNewClientModal
        open={showQuickClientModal}
        onClose={() => setShowQuickClientModal(false)}
        initialName={unregisteredClientName}
        initialBuilding={unregisteredClientName}
        initialArea={area}
        onClientRegistered={(newClient) => {
          const bName = cleanAddressDisplay(newClient.building_name || newClient.full_name || unregisteredClientName)
          setAddress(bName)
          setSelectedClientId(newClient.id)
          setClientName(newClient.full_name)
          setClientPhone(newClient.whatsapp || newClient.phone || '')
          if (newClient.area) setArea(newClient.area)
          setShowQuickClientModal(false)
        }}
      />
    </Modal>
  )
}
