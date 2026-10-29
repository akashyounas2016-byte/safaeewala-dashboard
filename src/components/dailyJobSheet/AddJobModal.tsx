import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { useData } from '@/store/DataContext'
import type { DailyJob, MaterialType, PaymentMode, Client } from '@/types'
import {
  cleanNum,
  calcHours,
  calcOTHours,
  MATERIALS,
  PAYMENT_MODES,
  ROW_COLOR_PRESETS,
  type RowColorPreset,
} from './jobSheetUtils'
import { addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { todayDubai } from '@/lib/dubaiTime'
import { notify } from '@/lib/notify'
import {
  User,
  Users,
  Clock,
  MapPin,
  CreditCard,
  Check,
  X,
  Palette,
  Package,
  Sparkles,
  FileText,
  AlertCircle,
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

const PRESET_MATERIALS = [
  'No',
  'Yes',
  'Chemicals Only',
  'Machines Only',
  'Sofa Kit',
  'Ladder',
]

export function AddJobForm({
  employees,
  onSave,
  onClose,
  initial,
  existingJobsForDate = [],
}: AddJobFormProps) {
  const { clients } = useData()

  // Staff & Team State
  const [selectedStaff, setSelectedStaff] = useState<string[]>(() => {
    if (!initial?.staff_name) return []
    return initial.staff_name.split(/[,+/&]|\band\b/i).map(s => s.trim()).filter(Boolean)
  })

  // Date
  const [date, setDate] = useState(() => initial?.date || todayDubai())

  // Auto-generate team name when multiple cleaners selected
  const defaultTeamName = useMemo(() => {
    if (selectedStaff.length < 2) return ''
    if (initial?.team_name) return initial.team_name
    // Find next available team letter for this date
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

  // Address & Area State
  const [address, setAddress] = useState(initial?.address ?? '')
  const [area, setArea] = useState(initial?.area ?? '')

  // Timing & Duration (Responsive auto-calculations)
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

  // Responsive synchronization between Start Time, End Time, and Duty Hours
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

  // Financials
  const [charges, setCharges] = useState<number | string>(initial?.charges ?? '')
  const [received, setReceived] = useState<number | string>(initial?.received ?? '')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial?.payment_mode ?? 'Cash')

  // Row Color Preset
  const [rowColor, setRowColor] = useState<string>(initial?.row_color || 'default')

  // Material selection & custom material support
  const isInitialCustomMaterial = Boolean(
    initial?.material && !PRESET_MATERIALS.includes(String(initial.material))
  )
  const [materialSelect, setMaterialSelect] = useState<string>(() => {
    if (!initial?.material) return 'No'
    return isInitialCustomMaterial ? '__custom__' : String(initial.material)
  })
  const [customMaterialInput, setCustomMaterialInput] = useState<string>(() => {
    return isInitialCustomMaterial ? String(initial?.material) : ''
  })

  // Remarks
  const [remarks, setRemarks] = useState(initial?.remarks ?? '')

  // Client Selection Helper
  const handleSelectClientAddress = (val: string) => {
    setAddress(val)
    const match = clients.find(c =>
      c.building_name?.toLowerCase().trim() === val.toLowerCase().trim() ||
      c.full_name?.toLowerCase().trim() === val.toLowerCase().trim() ||
      `${c.full_name} (${c.building_name || c.area})`.toLowerCase() === val.toLowerCase()
    )
    if (match) {
      if (match.area) setArea(match.area)
      if (match.building_name) setAddress(match.building_name)
      if (match.preferred_cleaner && selectedStaff.length === 0) {
        setSelectedStaff(match.preferred_cleaner.split(/[,+/&]|\band\b/i).map(s => s.trim()).filter(Boolean))
      }
      if (match.scheduled_time) {
        setStartTime(match.scheduled_time)
        if (match.duration_hours) {
          setDutyHours(match.duration_hours)
          const newEnd = addHoursToTime(match.scheduled_time, match.duration_hours)
          setEndTime(newEnd)
          setOtHours(calcOTHours(match.scheduled_time, newEnd))
        }
      }
    }
  }

  // Final Material string
  const resolvedMaterial: MaterialType = materialSelect === '__custom__'
    ? (customMaterialInput.trim() || 'Custom Material')
    : (materialSelect as MaterialType)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const finalStaff = selectedStaff.join(', ').trim()
    if (!finalStaff) {
      notify.error('Please select at least one cleaner / staff member.')
      return
    }

    if (!address.trim()) {
      notify.error('Please enter the client or service address.')
      return
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
      material:     resolvedMaterial,
      charges:      cleanNum(charges),
      received:     cleanNum(received),
      payment_mode: paymentMode,
      is_overtime:  isOvertime || cleanNum(otHours) > 0,
      remarks:      remarks.trim(),
      service:      '', // Service field permanently removed as requested
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-slate-800">
      {/* ── CARD 1: Staff & Team Assignment ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Users size={15} />
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-slate-900">Staff & Schedule</h4>
              <p className="text-[11px] text-slate-500">Assign cleaner(s) and job date</p>
            </div>
          </div>
          {selectedStaff.length >= 2 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Sparkles size={11} className="text-indigo-600" />
              Multi-Cleaner Team ({selectedStaff.length})
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
              Job Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-medium text-slate-800"
            />
          </div>
        </div>

        {/* Conditional Team Name Field (Only when 2+ cleaners selected) */}
        {selectedStaff.length >= 2 && (
          <div className="pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={12} className="text-indigo-600" />
                Team Reference Name <span className="text-slate-400 font-normal lowercase">(auto-generated, click to edit)</span>
              </label>
              <button
                type="button"
                onClick={() => setTeamName(defaultTeamName)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
              >
                Reset to {defaultTeamName}
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. Team A, Team Alpha…"
                className="w-full text-[13px] px-3.5 py-2.5 border border-indigo-200 rounded-xl bg-indigo-50/40 text-indigo-950 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
              />
              <span className="absolute right-3 top-2.5 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                Primary Lead: {selectedStaff[0]}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Payment & received amount will be recorded under <b>{selectedStaff[0]}</b>; other staff will display reference <b>{teamName || defaultTeamName}</b>.
            </p>
          </div>
        )}
      </div>

      {/* ── CARD 2: Responsive Timing, Hours & OT ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Clock size={15} />
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-slate-900">Timing & Duty Hours</h4>
              <p className="text-[11px] text-slate-500">Responsive auto-calculation across times, duration, and OT</p>
            </div>
          </div>
          {Number(otHours) > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
              +{otHours}h Overtime
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={e => handleStartTimeChange(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-semibold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={e => handleEndTimeChange(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-semibold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Duty Hours
            </label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={dutyHours}
              onChange={e => handleDutyHoursChange(Number(e.target.value) || 0)}
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between">
              <span>OT Hours</span>
              <span className="text-[10px] text-slate-400 font-normal">R-OT-01</span>
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
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-amber-500 focus:bg-white transition-all font-bold text-amber-900"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 text-[12px] text-slate-600">
          <input
            type="checkbox"
            id="modal_is_overtime"
            checked={isOvertime}
            onChange={e => setIsOvertime(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
          />
          <label htmlFor="modal_is_overtime" className="font-medium cursor-pointer">
            Mark Shift as Overtime (OT)
          </label>
          <span className="text-[11px] text-slate-400 ml-1">
            · Post-8 PM duty or &gt;8h basic work auto-computes as OT
          </span>
        </div>
      </div>

      {/* ── CARD 3: Client & Location ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <MapPin size={15} />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-slate-900">Address & Location</h4>
            <p className="text-[11px] text-slate-500">Client destination and community area</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Address / Building / Client
            </label>
            <input
              name="address"
              list="add-job-clients-address-options"
              value={address}
              onChange={e => handleSelectClientAddress(e.target.value)}
              placeholder="e.g. 202 Escape Tower, Sarah Johnson…"
              required
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800 font-semibold"
            />
            <datalist id="add-job-clients-address-options">
              {clients.map(c => {
                const label = c.building_name ? `${c.full_name} (${c.building_name}${c.area ? `, ${c.area}` : ''})` : c.full_name
                return <option key={c.id} value={c.building_name || c.full_name}>{label}</option>
              })}
            </datalist>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Location / Area
            </label>
            <input
              name="area"
              value={area}
              onChange={e => setArea(e.target.value)}
              placeholder="e.g. Downtown, Marina, Business Bay…"
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800 font-medium"
            />
          </div>
        </div>
      </div>

      {/* ── CARD 4: Financials & Payment ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CreditCard size={15} />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-slate-900">Charges & Collection</h4>
            <p className="text-[11px] text-slate-500">Service billing, collections, and payment mode</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-bold text-slate-800"
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
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-bold text-emerald-800"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Payment Mode
            </label>
            <select
              value={paymentMode}
              onChange={e => setPaymentMode(e.target.value as PaymentMode)}
              className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800 cursor-pointer"
            >
              {PAYMENT_MODES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── CARD 5: Customization (Row Color, Material with Custom, Remarks) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Palette size={15} />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-slate-900">Customization & Materials</h4>
            <p className="text-[11px] text-slate-500">Pick row color theme and specify supplies</p>
          </div>
        </div>

        {/* Row Color Picker */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5">
            <Palette size={12} className="text-slate-400" />
            Row Highlight Color
          </label>
          <div className="flex items-center gap-2.5 flex-wrap">
            {ROW_COLOR_PRESETS.map(preset => {
              const isSelected = rowColor === preset.id
              return (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => setRowColor(preset.id)}
                  title={preset.label}
                  className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer text-[12px] font-semibold ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 text-emerald-950 shadow-xs ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs flex items-center justify-center"
                    style={{ backgroundColor: preset.circleColor }}
                  >
                    {isSelected && <Check size={10} className="text-slate-800 stroke-[3]" />}
                  </span>
                  <span className="text-[11.5px]">{preset.label.replace('Soft ', '')}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Material Selection with Custom Value Support */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
            <Package size={12} className="text-slate-400" />
            Cleaning Material / Supplies
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <select
                value={materialSelect}
                onChange={e => {
                  const val = e.target.value
                  setMaterialSelect(val)
                  if (val !== '__custom__') setCustomMaterialInput('')
                }}
                className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all font-semibold text-slate-800 cursor-pointer"
              >
                {PRESET_MATERIALS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="__custom__">+ Custom Material…</option>
              </select>
            </div>
            {materialSelect === '__custom__' && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-150">
                <input
                  type="text"
                  value={customMaterialInput}
                  onChange={e => setCustomMaterialInput(e.target.value)}
                  placeholder="Enter custom material (e.g. Steam Cleaner, High Ladder)…"
                  autoFocus
                  required
                  className="w-full text-[13px] px-3.5 py-2.5 border border-emerald-400 rounded-xl bg-emerald-50/30 text-emerald-950 font-semibold focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                />
              </div>
            )}
          </div>
        </div>

        {/* Remarks */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
            <FileText size={12} className="text-slate-400" />
            Shift Remarks & Instructions
          </label>
          <input
            name="remarks"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Balcony wash, Sofa shampoo, Key with security, Online payment…"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-50/70 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
          />
        </div>
      </div>

      {/* ── ACTION FOOTER ── */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-11 rounded-xl font-bold text-slate-700 hover:bg-slate-100 border-slate-300 transition-all cursor-pointer"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[13px] shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <Plus size={16} className="stroke-[2.5]" />
          <span>Save & Add Job</span>
        </Button>
      </div>
    </form>
  )
}
