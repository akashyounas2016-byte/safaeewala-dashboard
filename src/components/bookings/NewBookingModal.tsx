import { useState, useRef, useEffect, useMemo } from 'react'
import {
  X, CheckCircle2, Clock, Calendar, User, Phone, MapPin,
  Sparkles, Plus, Search, Building2, Tag, ChevronDown, Check,
  AlertCircle, DollarSign, Users, Briefcase
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import { addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import type { Booking, BookingFrequency, Employee } from '@/types'

export interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onAdd: (booking: Omit<Booking, 'id' | 'created_at'>) => void
}

/* ─── Relevant Cleaning Service Suggestions ─── */
export const CLEANING_SERVICES = [
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

/* ─── Popular quick-select service chips ─── */
const POPULAR_SERVICES = [
  'Standard / General Cleaning',
  'Deep Cleaning',
  'Move-in / Move-out Cleaning',
  'Office / Commercial Cleaning',
  'Sofa & Upholstery Shampooing',
]

/* ─── Dynamic Start Time Presets ─── */
const START_TIME_PRESETS = [
  { label: '08:00 AM', value: '08:00' },
  { label: '09:00 AM', value: '09:00' },
  { label: '10:00 AM', value: '10:00' },
  { label: '11:00 AM', value: '11:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '01:00 PM', value: '13:00' },
  { label: '02:00 PM', value: '14:00' },
  { label: '03:00 PM', value: '15:00' },
  { label: '04:00 PM', value: '16:00' },
  { label: '05:00 PM', value: '17:00' },
]

/* ─── Dynamic Duration Presets ─── */
const DURATION_PRESETS = [
  { label: '2 hrs', value: 2 },
  { label: '3 hrs', value: 3 },
  { label: '4 hrs', value: 4 },
  { label: '5 hrs', value: 5 },
  { label: '6 hrs', value: 6 },
  { label: '8 hrs', value: 8 },
]

export function NewBookingModal({ open, onClose, onAdd }: NewBookingModalProps) {
  const { clients, employees } = useData()
  const formRef = useRef<HTMLFormElement>(null)

  // Client Autocomplete State
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  // Service Type State (combobox + custom option)
  const [serviceType, setServiceType] = useState('Standard / General Cleaning')
  const [isCustomService, setIsCustomService] = useState(false)
  const [customServiceName, setCustomServiceName] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const serviceDropdownRef = useRef<HTMLDivElement>(null)

  // Frequency
  const [frequency, setFrequency] = useState<BookingFrequency>('once')

  // Date, Time & Duration State
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState<number>(3)
  const [endTime, setEndTime] = useState(() => addHoursToTime('09:00', 3))

  // Amount & Crew & Notes
  const [totalAmount, setTotalAmount] = useState<number | ''>('')
  const [selectedCrew, setSelectedCrew] = useState<string[]>([])
  const [crewSearch, setCrewSearch] = useState('')
  const [showCrewDropdown, setShowCrewDropdown] = useState(false)
  const crewDropdownRef = useRef<HTMLDivElement>(null)
  const [notes, setNotes] = useState('')

  // Form Validation & Error state
  const [errors, setErrors] = useState<{ client?: string; date?: string; time?: string }>({})

  // Filter clients for autocomplete
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients.slice(0, 8)
    return clients.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.building_name && c.building_name.toLowerCase().includes(q)) ||
      (c.area && c.area.toLowerCase().includes(q))
    ).slice(0, 12)
  }, [clients, clientSearch])

  // Filter employees for crew assignment
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

  // Filter services for combobox
  const filteredServices = useMemo(() => {
    if (isCustomService) return []
    const q = serviceType.trim().toLowerCase()
    if (!q) return CLEANING_SERVICES
    return CLEANING_SERVICES.filter(s => s.toLowerCase().includes(q))
  }, [serviceType, isCustomService])

  // Close dropdowns on click outside
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false)
      }
      if (serviceDropdownRef.current && !serviceDropdownRef.current.contains(e.target as Node)) {
        setShowServiceDropdown(false)
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(e.target as Node)) {
        setShowCrewDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Client Selection
  const handleSelectClient = (c: any) => {
    setSelectedClientId(c.id)
    setClientSearch(c.full_name)
    setClientPhone(c.phone || c.whatsapp || '')
    const addr = [c.building_name, c.apartment, c.area].filter(Boolean).join(', ')
    setServiceAddress(addr)
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

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedClientId('')
      setClientSearch('')
      setClientPhone('')
      setServiceAddress('')
      setServiceType('Standard / General Cleaning')
      setIsCustomService(false)
      setCustomServiceName('')
      setFrequency('once')
      setScheduledDate(new Date().toISOString().split('T')[0])
      setStartTime('09:00')
      setDuration(3)
      setEndTime(addHoursToTime('09:00', 3))
      setTotalAmount('')
      setSelectedCrew([])
      setNotes('')
      setErrors({})
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

    const finalServiceName = isCustomService
      ? (customServiceName.trim() || 'Custom Cleaning Service')
      : (serviceType.trim() || 'Standard / General Cleaning')

    const matchedClient = clients.find(
      c => c.id === selectedClientId || c.full_name.toLowerCase().trim() === finalClientName.toLowerCase()
    )

    onAdd({
      client_name: finalClientName,
      client_phone: clientPhone.trim(),
      client_id: matchedClient?.id || selectedClientId || '',
      service_address: serviceAddress.trim(),
      service_type: finalServiceName,
      frequency,
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time: endTime,
      duration_hours: duration,
      total_amount: typeof totalAmount === 'number' ? totalAmount : Number(totalAmount) || 0,
      status: 'pending',
      assigned_crew: selectedCrew,
      notes: notes.trim(),
    })

    onClose()
  }

  const selectedEmployees = useMemo(() => {
    return employees.filter(e => selectedCrew.includes(e.id))
  }, [employees, selectedCrew])

  /* ── Header Action Buttons (Placed right before the Modal's X cross icon) ── */
  const headerActions = (
    <div className="flex items-center gap-2 mr-1">
      <button
        type="button"
        onClick={onClose}
        className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => handleSubmit()}
        className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
      >
        <CheckCircle2 size={14} className="stroke-[2.5]" />
        Create Booking
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Plus size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#111827]">New Booking</h2>
            <p className="text-[11px] text-slate-500 font-normal">Schedule single or recurring cleaning shift</p>
          </div>
        </div>
      }
      size="xl"
      headerActions={headerActions}
      bodyClassName="p-5 sm:p-6"
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* ── CARD 1: CLIENT & LOCATION ── */}
        <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <User size={13} className="text-emerald-600" />
              Client & Contact Details
            </span>
            {selectedClientId && (
              <span className="text-[10.5px] font-semibold text-teal-700 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check size={11} className="stroke-[3]" /> Linked Existing Client
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Client Autocomplete */}
            <div className="relative" ref={clientDropdownRef}>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search existing client or type new name…"
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setSelectedClientId('')
                    setShowClientDropdown(true)
                    if (errors.client) setErrors(prev => ({ ...prev, client: undefined }))
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border bg-white focus:outline-none transition-colors ${
                    errors.client
                      ? 'border-red-400 bg-red-50/30 focus:border-red-500'
                      : 'border-slate-200 focus:border-emerald-500'
                  }`}
                />
                <Search size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
              </div>
              {errors.client && <p className="text-[11px] text-red-500 font-medium mt-1">{errors.client}</p>}

              {/* Autocomplete Dropdown */}
              {showClientDropdown && filteredClients.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                  <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Registered Clients</span>
                    <span>{filteredClients.length} found</span>
                  </div>
                  {filteredClients.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50/70 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.full_name}</p>
                        <p className="text-[10.5px] text-slate-500 truncate">
                          {[c.phone, c.building_name, c.area].filter(Boolean).join(' · ') || 'No extra contact info'}
                        </p>
                      </div>
                      {c.source === 'monthly' && (
                        <span className="text-[9.5px] bg-teal-50 text-teal-700 font-bold px-1.5 py-0.5 rounded border border-teal-200 shrink-0">
                          Monthly
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Client Phone */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Contact Phone
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="+971 50 000 0000"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <Phone size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Service Address */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Service Address
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Building / Villa, Apartment / Unit, Street & Area (e.g. Marina Gate 1, Apt 1402, Dubai Marina)"
                value={serviceAddress}
                onChange={e => setServiceAddress(e.target.value)}
                className="w-full text-xs font-medium px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <MapPin size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ── CARD 2: SERVICE TYPE & FREQUENCY ── */}
        <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Briefcase size={13} className="text-teal-600" />
              Service Specification & Frequency
            </span>
            <button
              type="button"
              onClick={() => {
                setIsCustomService(!isCustomService)
                setShowServiceDropdown(false)
              }}
              className="text-[11px] font-bold text-teal-700 hover:text-teal-800 underline flex items-center gap-1"
            >
              {isCustomService ? '← Choose from standard services' : '+ Enter custom service name'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Service Type with suggestions + custom option */}
            <div className="relative" ref={serviceDropdownRef}>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Cleaning Service Type <span className="text-red-500">*</span>
              </label>

              {isCustomService ? (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter custom service type (e.g. Post-Event Cleanup)…"
                    value={customServiceName}
                    onChange={e => setCustomServiceName(e.target.value)}
                    autoFocus
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-teal-400 bg-teal-50/30 text-teal-900 focus:outline-none focus:border-teal-600"
                  />
                  <Tag size={14} className="absolute right-3 top-3 text-teal-600 pointer-events-none" />
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Select or search cleaning service…"
                    value={serviceType}
                    onChange={e => {
                      setServiceType(e.target.value)
                      setShowServiceDropdown(true)
                    }}
                    onFocus={() => setShowServiceDropdown(true)}
                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                  <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />

                  {/* Dropdown suggestions */}
                  {showServiceDropdown && filteredServices.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                      <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>Standard Cleaning Services ({filteredServices.length})</span>
                      </div>
                      {filteredServices.map(s => {
                        const isSelected = serviceType === s
                        return (
                          <button
                            type="button"
                            key={s}
                            onClick={() => {
                              setServiceType(s)
                              setShowServiceDropdown(false)
                            }}
                            className={`w-full px-3.5 py-2 text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
                              isSelected ? 'bg-emerald-50 text-emerald-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span>{s}</span>
                            {isSelected && <Check size={13} className="text-emerald-600 stroke-[3]" />}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomService(true)
                          setShowServiceDropdown(false)
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-bold text-teal-700 bg-teal-50/50 hover:bg-teal-100/60 flex items-center gap-1.5"
                      >
                        <Plus size={13} />
                        <span>Type a custom service name…</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Frequency Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Booking Frequency
              </label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as BookingFrequency)}
                className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="once">One-time Service</option>
                <option value="weekly">Weekly Recurring</option>
                <option value="biweekly">Bi-weekly Recurring</option>
                <option value="monthly">Monthly Recurring (Daily Job Sheet sync)</option>
              </select>
            </div>
          </div>

          {/* Quick popular service chips */}
          {!isCustomService && (
            <div className="pt-0.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Quick Service Picks:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_SERVICES.map(p => {
                  const active = serviceType === p
                  return (
                    <button
                      type="button"
                      key={p}
                      onClick={() => {
                        setServiceType(p)
                        setIsCustomService(false)
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-all ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── CARD 3: SCHEDULE & DYNAMIC TIME / DURATION ── */}
        <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200/80 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <Clock size={13} className="text-emerald-700" />
              Schedule & Dynamic Time Slot
            </span>
            <span className="text-[10.5px] font-semibold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
              Live Auto-Recalculation
            </span>
          </div>

          {/* Primary inputs: Date, Start Time, End Time, Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={e => {
                  setScheduledDate(e.target.value)
                  if (errors.date) setErrors(prev => ({ ...prev, date: undefined }))
                }}
                className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border bg-white focus:outline-none ${
                  errors.date ? 'border-red-400' : 'border-slate-200 focus:border-emerald-500'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={e => handleStartTimeChange(e.target.value)}
                className="w-full text-xs font-extrabold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-teal-800 mb-1">
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={e => handleEndTimeChange(e.target.value)}
                className="w-full text-xs font-extrabold px-3 py-2 rounded-xl border border-teal-200 bg-white text-teal-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-emerald-800 mb-1">
                Duration (Hours)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={duration}
                onChange={e => handleDurationChange(parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-extrabold px-3 py-2 rounded-xl border border-emerald-200 bg-white text-emerald-700 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Dynamic Start Time Presets (Chips for Fast 1-Click Entry) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-bold text-slate-600 uppercase tracking-wider">
                Fast Start Time Picks:
              </span>
              <span className="text-[10px] text-slate-500">Click to instantly set shift start</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {START_TIME_PRESETS.map(slot => {
                const active = startTime === slot.value
                return (
                  <button
                    type="button"
                    key={slot.value}
                    onClick={() => handleStartTimeChange(slot.value)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold transition-all ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs scale-[1.02]'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                    }`}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dynamic Duration Presets (Chips for Fast 1-Click Entry) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-bold text-slate-600 uppercase tracking-wider">
                Fast Duration Picks:
              </span>
              <span className="text-[10px] text-slate-500">Auto-calculates matching End Time</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map(dur => {
                const active = duration === dur.value
                return (
                  <button
                    type="button"
                    key={dur.value}
                    onClick={() => handleDurationChange(dur.value)}
                    className={`text-[11px] px-3 py-1 rounded-lg border font-bold transition-all ${
                      active
                        ? 'bg-teal-700 text-white border-teal-700 shadow-2xs scale-[1.02]'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-teal-50/50'
                    }`}
                  >
                    {dur.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Visual Synchronized Summary Pill */}
          <div className="flex items-center justify-between text-xs px-3.5 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-950 font-semibold shadow-2xs">
            <span className="flex items-center gap-1.5">
              <Clock size={14} className="text-emerald-600 shrink-0" />
              <span>
                Calculated Shift: <strong className="font-extrabold text-slate-900">{startTime || '—'}</strong> to <strong className="font-extrabold text-slate-900">{endTime || '—'}</strong>
              </span>
            </span>
            <span className="font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg">
              {duration} Hour{duration !== 1 ? 's' : ''} Duration
            </span>
          </div>
        </div>

        {/* ── CARD 4: AMOUNT & CREW ASSIGNMENT ── */}
        <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Amount */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
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
                  className="w-full text-xs font-extrabold px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">AED</span>
              </div>
              <p className="text-[10.5px] text-slate-400 mt-1">Leave empty or 0 if billable after service completion</p>
            </div>

            {/* Crew Assignment */}
            <div className="relative" ref={crewDropdownRef}>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Assign Cleaner / Crew
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={activeEmployees.length === 0 ? 'No active employees' : 'Search and assign cleaners…'}
                  value={crewSearch}
                  onFocus={() => setShowCrewDropdown(true)}
                  onChange={e => {
                    setCrewSearch(e.target.value)
                    setShowCrewDropdown(true)
                  }}
                  className="w-full text-xs font-medium px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
                />
                <Users size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
              </div>

              {/* Crew Selection Dropdown */}
              {showCrewDropdown && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                  <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Active Cleaners ({filteredEmployees.length})</span>
                    <button
                      type="button"
                      onClick={() => setShowCrewDropdown(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 font-bold"
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
                          className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                            isAssigned ? 'bg-emerald-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isAssigned ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                            }`}>
                              {isAssigned && <Check size={11} className="stroke-[3]" />}
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-800 truncate">{emp.full_name}</p>
                              <p className="text-[10px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                            </div>
                          </div>
                          {emp.agency_id && (
                            <span className="text-[9.5px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold shrink-0">
                              Agency
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {/* Selected crew chips */}
              {selectedEmployees.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedEmployees.map(emp => (
                    <span
                      key={emp.id}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200"
                    >
                      <span>👤 {emp.full_name}</span>
                      <button
                        type="button"
                        onClick={() => toggleCrew(emp.id)}
                        className="hover:text-red-600 font-extrabold cursor-pointer text-xs leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes / Instructions */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Special Instructions / Access Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Gate code, key location, focus on kitchen & master bedroom, pet on premises…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* ── BOTTOM ACTIONS (Complementary to Header Actions) ── */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="px-6 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 size={15} className="stroke-[2.5]" />
            Create Booking
          </Button>
        </div>
      </form>
    </Modal>
  )
}
