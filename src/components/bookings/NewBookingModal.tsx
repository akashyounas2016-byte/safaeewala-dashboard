import { useState, useRef, useEffect, useMemo } from 'react'
import {
  X, Check, Clock, Calendar, User, Phone, MapPin,
  Search, Briefcase, Users, FileText, Plus, Edit2, Trash2,
  ChevronDown, CheckCircle2, Sparkles, Settings2, RefreshCw
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import { addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import type { Booking, BookingFrequency, BookingStatus, Client } from '@/types'
import { todayDubai } from '@/lib/dubaiTime'
import { getDayNameFromDate } from '@/lib/clientDataSync'

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

const POPULAR_DUBAI_AREAS = [
  'Downtown Dubai',
  'Dubai Marina',
  'Jumeirah Lake Towers (JLT)',
  'Business Bay',
  'Palm Jumeirah',
  'Jumeirah Beach Residence (JBR)',
  'Dubai Hills Estate',
  'Jumeirah Village Circle (JVC)',
  'Arabian Ranches',
  'Damac Hills',
  'Dubai Creek Harbour',
  'Deira',
  'Bur Dubai',
  'Al Barsha',
  'The Greens & Views',
]

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function NewBookingModal({ open, onClose, onAdd }: NewBookingModalProps) {
  const { clients, employees } = useData()
  const formRef = useRef<HTMLFormElement>(null)

  // Booking Status (Confirmed vs Pending)
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('confirmed')

  // Client Autocomplete & Address State
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showAddressDropdown, setShowAddressDropdown] = useState(false)
  const clientDropdownRef = useRef<HTMLDivElement>(null)
  const addressDropdownRef = useRef<HTMLDivElement>(null)

  // Service Types Management
  const [serviceTypesList, setServiceTypesList] = useState<string[]>(() => {
    return safeLocalStorageGet('safaeewala_booking_service_types', DEFAULT_CLEANING_SERVICES)
  })
  const [serviceType, setServiceType] = useState('Standard / General Cleaning')
  const [isCustomService, setIsCustomService] = useState(false)
  const [customServiceName, setCustomServiceName] = useState('')
  const [showManageServices, setShowManageServices] = useState(false)
  const [newServiceNameInput, setNewServiceNameInput] = useState('')
  const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null)
  const [editingServiceName, setEditingServiceName] = useState('')

  // Frequency & Recurring Days
  const [frequency, setFrequency] = useState<BookingFrequency>('once')
  const [selectedDays, setSelectedDays] = useState<string[]>([])

  // Schedule, Timing & Duration
  const [scheduledDate, setScheduledDate] = useState(() => todayDubai())
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState<number>(3)
  const [endTime, setEndTime] = useState(() => addHoursToTime('09:00', 3))
  const [material, setMaterial] = useState<'No' | 'Yes'>('No')

  // Amount & Crew & Notes
  const [totalAmount, setTotalAmount] = useState<number | ''>('')
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const [crewSearch, setCrewSearch] = useState('')
  const [showCrewDropdown, setShowCrewDropdown] = useState(false)
  const crewDropdownRef = useRef<HTMLDivElement>(null)
  const [notes, setNotes] = useState('')

  // Form Validation & Error state
  const [errors, setErrors] = useState<{ client?: string; date?: string; time?: string; service?: string }>({})

  // Update recurring days default when date changes
  useEffect(() => {
    if (scheduledDate) {
      const dayName = getDayNameFromDate(scheduledDate)
      if (dayName && dayName !== 'Sunday') {
        setSelectedDays(prev => prev.length === 0 ? [dayName] : prev)
      }
    }
  }, [scheduledDate])

  // Filter clients for autocomplete from real dynamic clients store
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients.slice(0, 8)
    return clients.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.building_name && c.building_name.toLowerCase().includes(q)) ||
      (c.area && c.area.toLowerCase().includes(q))
    ).slice(0, 10)
  }, [clients, clientSearch])

  // Dynamic address suggestions from clients and popular areas
  const addressSuggestions = useMemo(() => {
    const suggestions: { title: string; subtitle?: string; source: 'client' | 'area' | 'saved' }[] = []

    // 1. If a client is selected, prioritize their primary address
    if (selectedClientId) {
      const c = clients.find(cl => cl.id === selectedClientId)
      if (c) {
        const full = [c.apartment ? `Apt ${c.apartment}` : '', c.building_name, c.area, c.city || 'Dubai'].filter(Boolean).join(', ')
        if (full) suggestions.push({ title: full, subtitle: `${c.full_name}'s Saved Address`, source: 'client' })
      }
    }

    // 2. Add client addresses from existing clients matching query
    const q = serviceAddress.trim().toLowerCase()
    clients.forEach(c => {
      const full = [c.apartment ? `Apt ${c.apartment}` : '', c.building_name, c.area].filter(Boolean).join(', ')
      if (full && (!q || full.toLowerCase().includes(q))) {
        if (!suggestions.some(s => s.title.toLowerCase() === full.toLowerCase())) {
          suggestions.push({ title: full, subtitle: c.full_name, source: 'client' })
        }
      }
    })

    // 3. Add popular Dubai areas
    POPULAR_DUBAI_AREAS.forEach(area => {
      if (!q || area.toLowerCase().includes(q)) {
        if (!suggestions.some(s => s.title.toLowerCase().includes(area.toLowerCase()))) {
          suggestions.push({ title: area, subtitle: 'Dubai Area / Location', source: 'area' })
        }
      }
    })

    return suggestions.slice(0, 12)
  }, [clients, selectedClientId, serviceAddress])

  // Filter active employees for crew assignment
  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.status !== 'inactive')
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const q = crewSearch.trim().toLowerCase()
    if (!q) return activeEmployees
    return activeEmployees.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      (e.role && e.role.toLowerCase().includes(q))
    )
  }, [activeEmployees, crewSearch])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false)
      }
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(e.target as Node)) {
        setShowAddressDropdown(false)
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(e.target as Node)) {
        setShowCrewDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Client Selection Handler
  const handleSelectClient = (c: Client) => {
    setSelectedClientId(c.id)
    setClientSearch(c.full_name)
    setClientPhone(c.phone || c.whatsapp || '')
    const addr = [c.apartment ? `Apt ${c.apartment}` : '', c.building_name, c.area].filter(Boolean).join(', ')
    if (addr) setServiceAddress(addr)

    // Auto-assign preferred cleaner if client has one
    if (c.preferred_cleaner) {
      const matchEmp = employees.find(e =>
        e.full_name.toLowerCase().trim() === c.preferred_cleaner?.toLowerCase().trim()
      )
      if (matchEmp && !selectedCrew.includes(matchEmp.id)) {
        setSelectedCrew(prev => [...prev, matchEmp.id])
      }
    }

    // Auto-fill typical scheduled time if exists
    if (c.scheduled_time) {
      setStartTime(c.scheduled_time)
      if (c.duration_hours) {
        setDuration(c.duration_hours)
        setEndTime(addHoursToTime(c.scheduled_time, c.duration_hours))
      }
    }

    setShowClientDropdown(false)
    if (errors.client) setErrors(prev => ({ ...prev, client: undefined }))
  }

  // Time & Duration Synchronization
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    if (newStart && duration > 0) {
      setEndTime(addHoursToTime(newStart, duration))
    }
    if (errors.time) setErrors(prev => ({ ...prev, time: undefined }))
  }

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    if (startTime && newEnd) {
      const calcDur = calcDurationFromTimes(startTime, newEnd)
      if (calcDur > 0) {
        setDuration(calcDur)
      }
    }
  }

  const handleDurationChange = (newDur: number) => {
    setDuration(newDur)
    if (startTime && newDur > 0) {
      setEndTime(addHoursToTime(startTime, newDur))
    }
  }

  // Toggle crew assignment
  const toggleCrew = (empId: string) => {
    setSelectedCrew(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    )
  }

  // Toggle recurring day
  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  // Services CRUD operations
  const handleAddService = () => {
    const trimmed = newServiceNameInput.trim()
    if (!trimmed) return
    if (!serviceTypesList.includes(trimmed)) {
      const updated = [...serviceTypesList, trimmed]
      setServiceTypesList(updated)
      safeLocalStorageSet('safaeewala_booking_service_types', updated)
      setServiceType(trimmed)
      setIsCustomService(false)
    }
    setNewServiceNameInput('')
  }

  const handleSaveEditService = (index: number) => {
    const trimmed = editingServiceName.trim()
    if (!trimmed) return
    const updated = [...serviceTypesList]
    const oldName = updated[index]
    updated[index] = trimmed
    setServiceTypesList(updated)
    safeLocalStorageSet('safaeewala_booking_service_types', updated)
    if (serviceType === oldName) {
      setServiceType(trimmed)
    }
    setEditingServiceIndex(null)
    setEditingServiceName('')
  }

  const handleDeleteService = (index: number) => {
    const target = serviceTypesList[index]
    const updated = serviceTypesList.filter((_, i) => i !== index)
    setServiceTypesList(updated)
    safeLocalStorageSet('safaeewala_booking_service_types', updated)
    if (serviceType === target) {
      setServiceType(updated[0] || 'Standard / General Cleaning')
    }
  }

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setBookingStatus('confirmed')
      setSelectedClientId('')
      setClientSearch('')
      setClientPhone('')
      setServiceAddress('')
      setServiceType('Standard / General Cleaning')
      setIsCustomService(false)
      setCustomServiceName('')
      setFrequency('once')
      const today = todayDubai()
      setScheduledDate(today)
      setStartTime('09:00')
      setDuration(3)
      setEndTime(addHoursToTime('09:00', 3))
      setMaterial('No')
      setTotalAmount('')
      setSelectedCrew([])
      setCrewSearch('')
      setNotes('')
      setErrors({})
      setShowClientDropdown(false)
      setShowAddressDropdown(false)
      setShowManageServices(false)
      const curDay = getDayNameFromDate(today)
      setSelectedDays(curDay && curDay !== 'Sunday' ? [curDay] : ['Monday'])
    }
  }, [open])

  // Submit Handler
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const finalClientName = clientSearch.trim()
    if (!finalClientName) {
      setErrors(prev => ({ ...prev, client: 'Please specify client name' }))
      return
    }

    if (!scheduledDate) {
      setErrors(prev => ({ ...prev, date: 'Scheduled date is required' }))
      return
    }

    if (!startTime) {
      setErrors(prev => ({ ...prev, time: 'Start time is required' }))
      return
    }

    const finalService = isCustomService
      ? (customServiceName.trim() || 'Custom Cleaning')
      : serviceType

    const matchedClient = clients.find(
      c => c.id === selectedClientId || c.full_name.toLowerCase().trim() === finalClientName.toLowerCase()
    )

    onAdd({
      client_name: finalClientName,
      client_phone: clientPhone.trim(),
      client_id: matchedClient?.id || selectedClientId || '',
      service_address: serviceAddress.trim() || 'Dubai',
      service_type: finalService,
      frequency,
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time: endTime,
      duration_hours: duration,
      material,
      total_amount: typeof totalAmount === 'number' ? totalAmount : Number(totalAmount) || 0,
      status: bookingStatus,
      assigned_crew: selectedCrew,
      notes: notes.trim(),
      recurring_days: frequency === 'monthly' ? selectedDays : undefined,
    })

    onClose()
  }

  const selectedEmployees = useMemo(() => {
    return employees.filter(e => selectedCrew.includes(e.id))
  }, [employees, selectedCrew])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Booking"
      size="xl"
      className="max-w-6xl"
      bodyClassName="p-4 sm:p-5"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-booking-form"
            size="sm"
            className="h-8 px-4 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Check size={13} className="stroke-[2.5]" />
            <span>Save Booking</span>
          </Button>
        </div>
      }
    >
      <form id="add-booking-form" ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        
        {/* ─── ROW 1: 3-COLUMN EXECUTIVE GRID WITH LIGHT THEMED BACKGROUND WIDGETS ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          
          {/* ─── WIDGET 1: CLIENT INFORMATION (Light Teal / Sky Tint) ─── */}
          <div className="space-y-3 bg-teal-50/40 p-4 rounded-2xl border border-teal-200/70 shadow-[0_2px_12px_rgba(13,148,136,0.04)]">
            <div className="flex items-center justify-between border-b border-teal-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-teal-100/80 text-teal-700 flex items-center justify-center">
                  <User size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-900">
                  Client Information
                </h4>
              </div>
              {selectedClientId && (
                <span className="text-[9.5px] font-bold text-teal-800 bg-teal-100/80 border border-teal-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-teal-600" />
                  <span>Synced Client</span>
                </span>
              )}
            </div>

            {/* Client Autocomplete Search */}
            <div className="relative" ref={clientDropdownRef}>
              <label className="text-xs font-semibold text-teal-950 block mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search client or type new name…"
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setSelectedClientId('')
                    setShowClientDropdown(true)
                    if (errors.client) setErrors(prev => ({ ...prev, client: undefined }))
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  className={`w-full text-[12px] pl-3 pr-8 py-2 bg-white border rounded-xl focus:outline-none font-semibold text-slate-800 shadow-2xs ${
                    errors.client ? 'border-red-400 bg-red-50/20' : 'border-teal-200/80 focus:border-teal-600 focus:ring-1 focus:ring-teal-500/20'
                  }`}
                />
                <Search size={13} className="absolute right-2.5 top-2.5 text-teal-600/70 pointer-events-none" />
              </div>
              {errors.client && <p className="text-[10px] text-red-500 mt-1 font-medium">{errors.client}</p>}

              {/* Dynamic Clients Dropdown */}
              {showClientDropdown && filteredClients.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-teal-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-teal-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 bg-teal-50/80 text-[10px] font-bold text-teal-800 uppercase tracking-wider flex items-center justify-between">
                    <span>Synced from Clients ({filteredClients.length})</span>
                    <button
                      type="button"
                      onClick={() => setShowClientDropdown(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  </div>
                  {filteredClients.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className="w-full px-3 py-2 text-left hover:bg-teal-50/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-slate-800 truncate">{c.full_name}</p>
                        <p className="text-[10.5px] text-slate-500 truncate mt-0.5">
                          {[c.phone, c.building_name, c.area].filter(Boolean).join(' • ') || 'No address specified'}
                        </p>
                      </div>
                      {c.source === 'monthly' && (
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                          Monthly
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Phone */}
            <div>
              <label className="text-xs font-semibold text-teal-950 block mb-1">
                Contact Phone / WhatsApp
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="+971 50 000 0000"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  className="w-full text-[12px] pl-3 pr-8 py-2 bg-white border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-500/20 font-medium text-slate-800 shadow-2xs"
                />
                <Phone size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Service Address (Dual Typing + Selection Picker) */}
            <div className="relative" ref={addressDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-teal-950">
                  Service Address & Location
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddressDropdown(!showAddressDropdown)}
                  className="text-[10px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
                >
                  <MapPin size={10} />
                  <span>{showAddressDropdown ? 'Hide Suggestions' : 'Pick Address'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type address or pick from list below…"
                  value={serviceAddress}
                  onChange={e => {
                    setServiceAddress(e.target.value)
                    setShowAddressDropdown(true)
                  }}
                  onFocus={() => setShowAddressDropdown(true)}
                  className="w-full text-[12px] pl-3 pr-8 py-2 bg-white border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-500/20 font-medium text-slate-800 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowAddressDropdown(p => !p)}
                  className="absolute right-2.5 top-2.5 text-teal-600 hover:text-teal-800 cursor-pointer"
                  title="Toggle address suggestions"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Address Suggestions Dropdown */}
              {showAddressDropdown && addressSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-teal-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-teal-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1 bg-teal-50 text-[9.5px] font-bold text-teal-800 uppercase tracking-wider flex items-center justify-between">
                    <span>Address Suggestions (Select or Type)</span>
                    <button
                      type="button"
                      onClick={() => setShowAddressDropdown(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  </div>
                  {addressSuggestions.map((item, idx) => (
                    <button
                      type="button"
                      key={`${item.title}-${idx}`}
                      onClick={() => {
                        setServiceAddress(item.title)
                        setShowAddressDropdown(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-teal-50/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-bold text-slate-800 truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-[10px] text-slate-500 truncate">{item.subtitle}</p>
                        )}
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                        item.source === 'client'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.source === 'client' ? 'Client' : 'Area'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── WIDGET 2: SERVICE & PRICING (Light Indigo / Violet Tint) ─── */}
          <div className="space-y-3 bg-indigo-50/35 p-4 rounded-2xl border border-indigo-200/70 shadow-[0_2px_12px_rgba(99,102,241,0.04)]">
            <div className="flex items-center justify-between border-b border-indigo-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
                  <Briefcase size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-indigo-950">
                  Service & Frequency
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowManageServices(true)}
                className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-100/70 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer"
                title="Manage Cleaning Services (Add, Edit, Delete)"
              >
                <Settings2 size={11} />
                <span>Manage</span>
              </button>
            </div>

            {/* Cleaning Service Type Selection & Custom Entry */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-indigo-950">
                  Cleaning Service Type <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomService(prev => !prev)}
                  className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
                >
                  {isCustomService ? 'Choose from list' : '+ Custom Entry'}
                </button>
              </div>

              {!isCustomService ? (
                <div className="relative">
                  <select
                    value={serviceType}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setIsCustomService(true)
                      } else {
                        setServiceType(e.target.value)
                      }
                    }}
                    className="w-full text-[12px] px-3 py-2 bg-white border border-indigo-200/80 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    {serviceTypesList.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="__custom__">+ Enter Custom Service…</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. Marble Polishing, Facade Wash…"
                      value={customServiceName}
                      onChange={e => setCustomServiceName(e.target.value)}
                      className="w-full text-[12px] px-3 py-2 bg-white border border-indigo-300 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-800 shadow-2xs"
                    />
                    <Sparkles size={13} className="absolute right-2.5 top-2.5 text-indigo-500 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-indigo-700/80 font-medium">
                    Custom service will be attached to this booking.
                  </p>
                </div>
              )}
            </div>

            {/* Booking Frequency */}
            <div>
              <label className="text-xs font-semibold text-indigo-950 block mb-1">
                Booking Frequency
              </label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as BookingFrequency)}
                className="w-full text-[12px] px-3 py-2 bg-white border border-indigo-200/80 rounded-xl focus:outline-none focus:border-indigo-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="once">One-time Service</option>
                <option value="weekly">Weekly Recurring</option>
                <option value="biweekly">Bi-weekly Recurring</option>
                <option value="monthly">Monthly Recurring (Daily Job Sheet Sync)</option>
              </select>
            </div>

            {/* Recurring Days of Week for Monthly */}
            {frequency === 'monthly' && (
              <div className="space-y-1.5 p-2.5 rounded-xl bg-white/80 border border-indigo-200/90">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-950">Recurring Service Days:</span>
                  <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                    {selectedDays.length} Days/wk
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {WEEK_DAYS.map(day => {
                    const active = selectedDays.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`text-[10px] py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100/80'
                        }`}
                        title={day}
                      >
                        {day.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[9.5px] text-slate-500 italic">
                  Daily Job Sheet will auto-generate shifts on these days.
                </p>
              </div>
            )}

            {/* Total Amount AED */}
            <div>
              <label className="text-xs font-semibold text-indigo-950 block mb-1">
                Total Amount (AED)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full text-[12px] pl-3 pr-12 py-2 bg-white border border-indigo-200/80 rounded-xl focus:outline-none focus:border-indigo-600 font-bold text-slate-900 shadow-2xs"
                />
                <span className="absolute right-3 top-2 text-[11px] font-bold text-indigo-400 pointer-events-none">
                  AED
                </span>
              </div>
            </div>
          </div>

          {/* ─── WIDGET 3: SCHEDULE & TIMING (Light Mint / Emerald Tint) ─── */}
          <div className="space-y-3 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-200/70 shadow-[0_2px_12px_rgba(16,185,129,0.04)]">
            <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                  <Clock size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-emerald-950">
                  Schedule & Timing
                </h4>
              </div>
              <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <RefreshCw size={9} className="animate-spin text-emerald-600" />
                <span>Job Sheet Sync</span>
              </span>
            </div>

            {/* Date */}
            <div>
              <label className="text-xs font-semibold text-emerald-950 block mb-1">
                Scheduled Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={e => {
                  setScheduledDate(e.target.value)
                  if (errors.date) setErrors(prev => ({ ...prev, date: undefined }))
                }}
                className={`w-full text-[12px] px-3 py-2 bg-white border rounded-xl focus:outline-none font-medium text-slate-600 shadow-2xs ${
                  errors.date ? 'border-red-400 bg-red-50/20' : 'border-emerald-200/80 focus:border-emerald-600'
                }`}
              />
              {errors.date && <p className="text-[10px] text-red-500 mt-1 font-medium">{errors.date}</p>}
            </div>

            {/* Start Time & End Time */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-emerald-950 block mb-1">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-emerald-200/80 rounded-xl focus:outline-none focus:border-emerald-600 font-medium text-slate-600 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-emerald-950 block mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-emerald-200/80 rounded-xl focus:outline-none focus:border-emerald-600 font-medium text-slate-600 shadow-2xs"
                />
              </div>
            </div>

            {/* Duration Hours & Material Option Side-by-Side */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-emerald-950 block mb-1">
                  Duty Duration (Hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={duration}
                  onChange={e => handleDurationChange(parseFloat(e.target.value) || 0)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-emerald-200/80 rounded-xl focus:outline-none focus:border-emerald-600 font-bold text-emerald-900 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-emerald-950 block mb-1 flex items-center justify-between">
                  <span>Cleaning Material</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded transition-colors ${
                    material === 'Yes'
                      ? 'bg-emerald-200 text-emerald-950 border border-emerald-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {material === 'Yes' ? 'Required' : 'No'}
                  </span>
                </label>
                <div className="relative">
                  <select
                    value={material}
                    onChange={e => setMaterial(e.target.value as 'No' | 'Yes')}
                    className="w-full text-[12px] px-2.5 py-2 bg-white border border-emerald-200/80 rounded-xl focus:outline-none focus:border-emerald-600 font-bold text-slate-800 shadow-2xs cursor-pointer appearance-none pr-7"
                  >
                    <option value="No">No (Client Provides)</option>
                    <option value="Yes">Yes (Material Required)</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-3 text-emerald-700 pointer-events-none" />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ─── ROW 2: 2-COLUMN LOWER EXECUTIVE GRID ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          
          {/* ─── WIDGET 4: CREW ASSIGNMENT (Light Amber / Orange Tint) ─── */}
          <div className="space-y-3 bg-amber-50/35 p-4 rounded-2xl border border-amber-200/70 shadow-[0_2px_12px_rgba(245,158,11,0.04)]" ref={crewDropdownRef}>
            <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center">
                  <Users size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-amber-950">
                  Crew Assignment ({selectedCrew.length})
                </h4>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                selectedCrew.length === 0
                  ? 'bg-amber-100/80 text-amber-800 border-amber-300'
                  : 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
              }`}>
                {selectedCrew.length === 0 ? 'Unassigned' : `${selectedCrew.length} Assigned`}
              </span>
            </div>

            {/* Crew search and dropdown */}
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  placeholder={activeEmployees.length === 0 ? 'No active cleaners' : 'Search and assign cleaners…'}
                  value={crewSearch}
                  onFocus={() => setShowCrewDropdown(true)}
                  onChange={e => {
                    setCrewSearch(e.target.value)
                    setShowCrewDropdown(true)
                  }}
                  className="w-full text-[12px] pl-3 pr-8 py-2 bg-white border border-amber-200/80 rounded-xl focus:outline-none focus:border-amber-600 font-medium text-slate-800 shadow-2xs"
                />
                <Users size={13} className="absolute right-2.5 top-2.5 text-amber-500 pointer-events-none" />
              </div>

              {/* Crew Picker Dropdown */}
              {showCrewDropdown && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-amber-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-amber-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 bg-amber-50 text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center justify-between">
                    <span>Available Cleaners ({filteredEmployees.length})</span>
                    <button
                      type="button"
                      onClick={() => setShowCrewDropdown(false)}
                      className="text-amber-800 hover:text-amber-950 font-bold text-[10px] cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                  {filteredEmployees.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 text-center">No active cleaners found</p>
                  ) : (
                    filteredEmployees.map(emp => {
                      const isAssigned = selectedCrew.includes(emp.id)
                      return (
                        <button
                          type="button"
                          key={emp.id}
                          onClick={() => toggleCrew(emp.id)}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isAssigned ? 'bg-amber-50/80' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isAssigned ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-300'
                            }`}>
                              {isAssigned && <Check size={11} className="stroke-[3]" />}
                            </div>
                            <div className="truncate">
                              <p className="text-[12px] font-bold text-slate-800 truncate">{emp.full_name}</p>
                              <p className="text-[10px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                            </div>
                          </div>
                          {emp.agency_id && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold shrink-0">
                              Agency
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Selected Crew Chips */}
            <div className="min-h-[42px] p-2 rounded-xl bg-white border border-amber-200/80 flex flex-wrap gap-1.5 items-center">
              {selectedEmployees.length === 0 ? (
                <span className="text-[11px] text-slate-400 italic px-1">
                  No cleaner assigned yet (can be assigned later on Job Sheet)
                </span>
              ) : (
                selectedEmployees.map(emp => (
                  <span
                    key={emp.id}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-amber-100/70 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200/80"
                  >
                    <span>🧹 {emp.full_name}</span>
                    <button
                      type="button"
                      onClick={() => toggleCrew(emp.id)}
                      className="hover:text-red-600 font-black cursor-pointer text-xs ml-0.5"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* ─── WIDGET 5: ACCESS & SPECIAL INSTRUCTIONS (Light Slate / Blue Tint) ─── */}
          <div className="space-y-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-200/70 text-slate-700 flex items-center justify-center">
                  <FileText size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-slate-800">
                  Access & Special Notes
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Optional</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Access Notes & Special Instructions
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Gate pass code 4492, key under doormat, pet inside, focus on kitchen deep clean…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full text-[12px] p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs resize-none"
              />
            </div>

            {/* Quick Note Tags */}
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto pt-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Quick Add:</span>
              {[
                'Gate pass code',
                'Key with security',
                'Pet friendly',
                'Bring vacuum',
              ].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setNotes(prev => prev ? `${prev}, ${tag}` : tag)}
                  className="text-[10px] font-semibold bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                >
                  +{tag}
                </button>
              ))}
            </div>
          </div>
        </div>

      </form>

      {/* ─── MODAL: MANAGE CLEANING SERVICE TYPES (Add, Edit, Delete) ─── */}
      {showManageServices && (
        <Modal
          open={showManageServices}
          onClose={() => setShowManageServices(false)}
          title="Manage Cleaning Service Types"
          size="md"
        >
          <div className="space-y-4 p-4 text-[12.5px]">
            <p className="text-slate-500">
              Customize the list of cleaning services available across the Booking Dashboard.
            </p>

            {/* Add New Service Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="New service name (e.g. Facade Cleaning)"
                value={newServiceNameInput}
                onChange={e => setNewServiceNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddService()
                  }
                }}
                className="flex-1 text-[12px] px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium"
              />
              <Button
                type="button"
                onClick={handleAddService}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-3.5 py-2 font-bold cursor-pointer shrink-0"
              >
                <Plus size={13} className="mr-1" />
                <span>Add</span>
              </Button>
            </div>

            {/* Service List */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
              {serviceTypesList.map((svc, idx) => (
                <div key={`${svc}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2">
                  {editingServiceIndex === idx ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingServiceName}
                        onChange={e => setEditingServiceName(e.target.value)}
                        className="flex-1 text-[12px] px-2 py-1 bg-white border border-teal-500 rounded-lg focus:outline-none font-semibold text-slate-800"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditService(idx)}
                        className="text-xs text-emerald-600 font-bold px-2 py-1 hover:bg-emerald-50 rounded"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingServiceIndex(null)
                          setEditingServiceName('')
                        }}
                        className="text-xs text-slate-400 font-bold px-2 py-1 hover:bg-slate-50 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-700 truncate">{svc}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingServiceIndex(idx)
                            setEditingServiceName(svc)
                          }}
                          className="p-1 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded cursor-pointer"
                          title="Edit Service"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteService(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          title="Delete Service"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setServiceTypesList(DEFAULT_CLEANING_SERVICES)
                  safeLocalStorageSet('safaeewala_booking_service_types', DEFAULT_CLEANING_SERVICES)
                }}
                className="text-[11px] text-slate-500 hover:text-teal-700 font-medium cursor-pointer"
              >
                Reset to Standard Defaults
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowManageServices(false)}
                className="cursor-pointer"
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
