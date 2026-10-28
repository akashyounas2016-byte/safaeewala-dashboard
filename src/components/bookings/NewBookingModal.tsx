import { useState, useRef, useEffect, useMemo } from 'react'
import {
  X, Check, Clock, Calendar, User, Phone, MapPin,
  Search, Briefcase, Users, FileText
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import { addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import type { Booking, BookingFrequency, BookingStatus } from '@/types'

export interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onAdd: (booking: Omit<Booking, 'id' | 'created_at'>) => void
}

/* ─── Standard Cleaning Services (Industry-Relevant Options) ─── */
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

export function NewBookingModal({ open, onClose, onAdd }: NewBookingModalProps) {
  const { clients, employees } = useData()
  const formRef = useRef<HTMLFormElement>(null)

  // Booking Status (Confirmed vs Pending)
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('confirmed')

  // Client Autocomplete State
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  // Service Type & Frequency
  const [serviceType, setServiceType] = useState('Standard / General Cleaning')
  const [frequency, setFrequency] = useState<BookingFrequency>('once')

  // Schedule, Timing & Duration
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
    ).slice(0, 10)
  }, [clients, clientSearch])

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
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(e.target as Node)) {
        setShowCrewDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Client Selection Handler
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
      setBookingStatus('confirmed')
      setSelectedClientId('')
      setClientSearch('')
      setClientPhone('')
      setServiceAddress('')
      setServiceType('Standard / General Cleaning')
      setFrequency('once')
      setScheduledDate(new Date().toISOString().split('T')[0])
      setStartTime('09:00')
      setDuration(3)
      setEndTime(addHoursToTime('09:00', 3))
      setTotalAmount('')
      setSelectedCrew([])
      setCrewSearch('')
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

    const matchedClient = clients.find(
      c => c.id === selectedClientId || c.full_name.toLowerCase().trim() === finalClientName.toLowerCase()
    )

    onAdd({
      client_name: finalClientName,
      client_phone: clientPhone.trim(),
      client_id: matchedClient?.id || selectedClientId || '',
      service_address: serviceAddress.trim(),
      service_type: serviceType,
      frequency,
      scheduled_date: scheduledDate,
      scheduled_time: startTime,
      end_time: endTime,
      duration_hours: duration,
      total_amount: typeof totalAmount === 'number' ? totalAmount : Number(totalAmount) || 0,
      status: bookingStatus,
      assigned_crew: selectedCrew,
      notes: notes.trim(),
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
        <div className="flex items-center gap-3">
          {/* Header Status Toggle before Cancel */}
          <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
            <span className="text-[11px] font-bold text-slate-500">Status:</span>
            <button
              type="button"
              onClick={() => setBookingStatus(prev => prev === 'confirmed' ? 'pending' : 'confirmed')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                bookingStatus === 'confirmed' ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
              title={`Booking is ${bookingStatus}. Click to toggle.`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                  bookingStatus === 'confirmed' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-[11px] font-black uppercase tracking-wider ${
              bookingStatus === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {bookingStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
            </span>
          </div>

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
      <form id="add-booking-form" ref={formRef} onSubmit={handleSubmit} className="space-y-3.5">
        {/* ── ROW 1: 3-COLUMN EXECUTIVE GRID (Client · Service & Pricing · Schedule & Timing) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* ── CARD 1: CLIENT DETAILS ── */}
          <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-teal-600" />
                <span>Client Information</span>
              </span>
              {selectedClientId && (
                <span className="text-[9.5px] font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                  Linked Client
                </span>
              )}
            </h4>

            {/* Client Autocomplete */}
            <div className="relative" ref={clientDropdownRef}>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search existing or enter name…"
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setSelectedClientId('')
                    setShowClientDropdown(true)
                    if (errors.client) setErrors(prev => ({ ...prev, client: undefined }))
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  className={`w-full text-[12px] px-2.5 py-2 bg-white border rounded-xl focus:outline-none font-medium text-slate-800 shadow-2xs pr-8 ${
                    errors.client ? 'border-red-400 bg-red-50/20' : 'border-slate-200 focus:border-teal-600'
                  }`}
                />
                <Search size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
              </div>
              {errors.client && <p className="text-[10px] text-red-500 mt-0.5 font-medium">{errors.client}</p>}

              {/* Autocomplete Dropdown */}
              {showClientDropdown && filteredClients.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                  <div className="px-2.5 py-1 bg-slate-50 text-[9.5px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Registered Clients ({filteredClients.length})</span>
                  </div>
                  {filteredClients.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className="w-full px-2.5 py-1.5 text-left hover:bg-teal-50/70 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-bold text-slate-800 truncate">{c.full_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {[c.phone, c.building_name, c.area].filter(Boolean).join(' · ') || 'No extra info'}
                        </p>
                      </div>
                      {c.source === 'monthly' && (
                        <span className="text-[9px] bg-teal-50 text-teal-700 font-bold px-1.5 py-0.5 rounded border border-teal-200 shrink-0">
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
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Contact Phone
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="+971 50 000 0000"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs pr-8"
                />
                <Phone size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Service Address */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Service Address & Area
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Marina Gate 1, Apt 1402, Dubai Marina"
                  value={serviceAddress}
                  onChange={e => setServiceAddress(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs pr-8"
                />
                <MapPin size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* ── CARD 2: SERVICE SPECIFICATION & FREQUENCY ── */}
          <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <Briefcase size={13} className="text-teal-600" />
              <span>Service & Frequency</span>
            </h4>

            {/* Cleaning Service Type Select */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Cleaning Service Type <span className="text-red-500">*</span>
              </label>
              <select
                value={serviceType}
                onChange={e => setServiceType(e.target.value)}
                className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 cursor-pointer shadow-2xs"
              >
                {CLEANING_SERVICES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Booking Frequency Select */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Booking Frequency
              </label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as BookingFrequency)}
                className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="once">One-time Service</option>
                <option value="weekly">Weekly Recurring</option>
                <option value="biweekly">Bi-weekly Recurring</option>
                <option value="monthly">Monthly Recurring (Daily Job Sheet sync)</option>
              </select>
            </div>

            {/* Total Amount AED */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
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
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-bold text-slate-800 shadow-2xs pr-12"
                />
                <span className="absolute right-2.5 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                  AED
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Optional; billable upon job completion</p>
            </div>
          </div>

          {/* ── CARD 3: SCHEDULE & TIMING ── */}
          <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-teal-600" />
                <span>Schedule & Timing</span>
              </span>
              <span className="text-[9.5px] font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full">
                Live Sync
              </span>
            </h4>

            {/* Date */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
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
                className={`w-full text-[12px] px-2.5 py-2 bg-white border rounded-xl focus:outline-none font-semibold text-slate-800 shadow-2xs ${
                  errors.date ? 'border-red-400 bg-red-50/20' : 'border-slate-200 focus:border-teal-600'
                }`}
              />
              {errors.date && <p className="text-[10px] text-red-500 mt-0.5 font-medium">{errors.date}</p>}
            </div>

            {/* Start Time & End Time */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-bold text-slate-800 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-bold text-slate-800 shadow-2xs"
                />
              </div>
            </div>

            {/* Duration Hours */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Duration (Hours)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={duration}
                onChange={e => handleDurationChange(parseFloat(e.target.value) || 0)}
                className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-bold text-teal-800 shadow-2xs"
              />
            </div>

            {/* Synchronized Shift Visual Banner */}
            <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-teal-50/80 border border-teal-200/80 text-teal-900 font-medium">
              <span>Shift: <strong className="font-bold">{startTime || '—'}</strong> to <strong className="font-bold">{endTime || '—'}</strong></span>
              <span className="font-bold text-teal-800 bg-white px-2 py-0.5 rounded-md border border-teal-200 shadow-2xs">
                {duration}h Duration
              </span>
            </div>
          </div>
        </div>

        {/* ── ROW 2: 2-COLUMN GRID (Crew Assignment · Special Instructions & Notes) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* ── CARD 4: CREW ASSIGNMENT ── */}
          <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80" ref={crewDropdownRef}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                <Users size={13} className="text-teal-600" />
                <span>Crew Assignment ({selectedCrew.length})</span>
              </h4>
              <span className="text-[10.5px] font-semibold text-slate-500">
                {selectedCrew.length === 0 ? 'Unassigned' : `${selectedCrew.length} Assigned`}
              </span>
            </div>

            {/* Crew search and picker */}
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
                  className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs pr-8"
                />
                <Users size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Crew dropdown */}
              {showCrewDropdown && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                  <div className="px-2.5 py-1 bg-slate-50 text-[9.5px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Active Cleaning Staff ({filteredEmployees.length})</span>
                    <button
                      type="button"
                      onClick={() => setShowCrewDropdown(false)}
                      className="text-[9.5px] text-teal-700 hover:text-teal-900 font-bold cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                  {filteredEmployees.length === 0 ? (
                    <p className="p-2.5 text-xs text-slate-400 text-center">No active cleaners found</p>
                  ) : (
                    filteredEmployees.map(emp => {
                      const isAssigned = selectedCrew.includes(emp.id)
                      return (
                        <button
                          type="button"
                          key={emp.id}
                          onClick={() => toggleCrew(emp.id)}
                          className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isAssigned ? 'bg-teal-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isAssigned ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300'
                            }`}>
                              {isAssigned && <Check size={10} className="stroke-[3]" />}
                            </div>
                            <div className="truncate">
                              <p className="text-[11.5px] font-bold text-slate-800 truncate">{emp.full_name}</p>
                              <p className="text-[9.5px] text-slate-400">{emp.role === 'crew_lead' ? 'Crew Lead' : 'Cleaner'}</p>
                            </div>
                          </div>
                          {emp.agency_id && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-semibold shrink-0">
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

            {/* Selected crew chips */}
            <div className="min-h-[38px] p-1.5 rounded-xl bg-white border border-slate-200/80 flex flex-wrap gap-1.5 items-center">
              {selectedEmployees.length === 0 ? (
                <span className="text-[11px] text-slate-400 italic px-1">No cleaner assigned yet (optional)</span>
              ) : (
                selectedEmployees.map(emp => (
                  <span
                    key={emp.id}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-lg border border-teal-200/80"
                  >
                    <span>👤 {emp.full_name}</span>
                    <button
                      type="button"
                      onClick={() => toggleCrew(emp.id)}
                      className="hover:text-red-600 font-black cursor-pointer text-xs leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* ── CARD 5: SPECIAL INSTRUCTIONS & ACCESS NOTES ── */}
          <div className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <FileText size={13} className="text-teal-600" />
              <span>Special Instructions & Access Notes</span>
            </h4>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Access Notes & Key Instructions
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Gate pass code, key under mat, focus on kitchen deep clean, pet dog inside…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full text-[12px] px-2.5 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs resize-none"
              />
            </div>
            <p className="text-[10px] text-slate-400">These instructions will be visible on the dispatcher sheet and crew job notes.</p>
          </div>
        </div>
      </form>
    </Modal>
  )
}
