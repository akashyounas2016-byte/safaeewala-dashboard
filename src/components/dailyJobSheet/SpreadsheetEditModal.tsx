import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { DailyJob, MaterialType, PaymentMode, Client } from '@/types'
import {
  cleanNum,
  calcHours,
  calcOTHours,
  formatTime12h,
  formatTime24h,
} from './jobSheetUtils'
import { addHoursToTime, calcDurationFromTimes } from '@/lib/utils'
import { isMonthlyClient } from '@/lib/clientDataSync'
import {
  Users,
  Clock,
  CreditCard,
  Check,
} from 'lucide-react'

export interface SpreadsheetEditModalProps {
  open: boolean
  row: DailyJob | null
  index: number
  onClose: () => void
  onSave: (updatedRow: DailyJob, index: number) => void
  employees: { full_name: string }[]
  clients: Client[]
  areaOptions?: string[]
}

const PRESET_MATERIALS = [
  'No',
  'Yes',
  'Chemicals Only',
  'Machines Only',
  'Sofa Kit',
  'Ladder',
]

export function SpreadsheetEditModal({
  open,
  row,
  index,
  onClose,
  onSave,
  employees,
  clients,
  areaOptions = [],
}: SpreadsheetEditModalProps) {
  const [staffName, setStaffName] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('13:00')
  const [dutyHours, setDutyHours] = useState<number>(4)
  const [otHours, setOtHours] = useState<number | string>(0)
  const [material, setMaterial] = useState<string>('No')
  const [customMaterial, setCustomMaterial] = useState('')
  const [charges, setCharges] = useState<number | string>(0)
  const [received, setReceived] = useState<number | string>(0)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash')
  const [remarks, setRemarks] = useState('')

  // Populate state when row opens
  useEffect(() => {
    if (!row) return
    setStaffName(row.staff_name || '')
    setAddress(row.address || '')
    setArea(row.area || '')
    const s = row.start_time || '09:00'
    const e = row.end_time || '13:00'
    setStartTime(s)
    setEndTime(e)
    setDutyHours(Number(row.duty_hours) || calcHours(s, e) || 4)
    setOtHours(row.ot_hours !== undefined ? row.ot_hours : calcOTHours(s, e))
    
    const mat = String(row.material || 'No')
    if (PRESET_MATERIALS.includes(mat)) {
      setMaterial(mat)
      setCustomMaterial('')
    } else {
      setMaterial('Other')
      setCustomMaterial(mat)
    }

    setCharges(row.charges ?? 0)
    setReceived(row.received ?? 0)
    setPaymentMode((row.payment_mode as PaymentMode) || 'Cash')
    setRemarks(row.remarks || '')
  }, [row, open])

  // Responsive synchronization between Start Time, End Time, and Duty Hours
  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart)
    if (newStart && dutyHours > 0) {
      const calculatedEnd = addHoursToTime(newStart, dutyHours)
      setEndTime(calculatedEnd)
      setOtHours(calcOTHours(newStart, calculatedEnd))
    }
  }

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd)
    if (startTime && newEnd) {
      const duration = calcDurationFromTimes(startTime, newEnd)
      if (duration > 0) {
        setDutyHours(duration)
        setOtHours(calcOTHours(startTime, newEnd))
      }
    }
  }

  const handleDutyHoursChange = (newDuty: number) => {
    setDutyHours(newDuty)
    if (startTime && newDuty > 0) {
      const calculatedEnd = addHoursToTime(startTime, newDuty)
      setEndTime(calculatedEnd)
      setOtHours(calcOTHours(startTime, calculatedEnd))
    }
  }

  // Client Selection Handler
  const handleClientSelect = (clientId: string) => {
    const selected = clients.find(c => c.id === clientId)
    if (selected) {
      const addr = [selected.apartment, selected.building_name].filter(Boolean).join(', ') || selected.full_name
      setAddress(addr)
      if (selected.area) setArea(selected.area)
      if (selected.preferred_cleaner) setStaffName(selected.preferred_cleaner)
      if (isMonthlyClient(selected)) setPaymentMode('Monthly')
    }
  }

  const pendingAmount = Math.max(0, cleanNum(charges) - cleanNum(received))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!row) return

    const finalMaterial = (material === 'Other' && customMaterial.trim()
      ? customMaterial.trim()
      : material) as MaterialType

    const updatedRow: DailyJob = {
      ...row,
      staff_name: staffName.trim(),
      address: address.trim(),
      area: area.trim(),
      start_time: startTime,
      end_time: endTime,
      duty_hours: dutyHours,
      ot_hours: cleanNum(otHours),
      material: finalMaterial,
      charges: cleanNum(charges),
      received: cleanNum(received),
      payment_mode: paymentMode,
      remarks: remarks.trim(),
    }

    onSave(updatedRow, index)
  }

  if (!open || !row) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Job Sheet Entry"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-slate-800 p-4">
        {/* ── CARD 1: Staff & Client Assignment ── */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <Users size={15} />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-slate-900">Staff & Client Information</h4>
                <p className="text-[11px] text-slate-500">Row #{index + 1} · Date: {row.date}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Dynamic Staff Name Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Staff Name <span className="text-red-500">*</span>
              </label>
              <select
                value={staffName}
                onChange={e => setStaffName(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-600 transition-all font-semibold text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="">-- Select Cleaner / Driver --</option>
                {employees.map(emp => (
                  <option key={emp.full_name} value={emp.full_name}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Client Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between">
                <span>Quick Select Client</span>
                <span className="text-[10px] text-emerald-700 font-bold lowercase">auto-fills location</span>
              </label>
              <select
                onChange={e => handleClientSelect(e.target.value)}
                defaultValue=""
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-600 transition-all font-semibold text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="">-- Choose Existing Client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} {c.area ? `(${c.area})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Client & Address + Area */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Client / Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. Villa 14, Springs 3"
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-600 transition-all font-semibold text-slate-800 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Area
              </label>
              <input
                type="text"
                value={area}
                onChange={e => setArea(e.target.value)}
                list="edit-modal-area-list"
                placeholder="e.g. Marina, Downtown"
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-600 transition-all font-semibold text-slate-800 shadow-2xs"
              />
              <datalist id="edit-modal-area-list">
                {areaOptions.map(a => <option key={a} value={a} />)}
              </datalist>
            </div>
          </div>
        </div>

        {/* ── CARD 2: Schedule & Timing (Responsive 12h Format) ── */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                <Clock size={15} />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-slate-900">Schedule & Duty Hours</h4>
                <p className="text-[11px] text-slate-500">12-Hour AM/PM format with auto Overtime</p>
              </div>
            </div>
            {Number(otHours) > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                +{otHours}h Overtime
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between">
                <span>Start Time</span>
                <span className="text-blue-600 font-bold normal-case">{formatTime12h(startTime)}</span>
              </label>
              <input
                type="time"
                value={formatTime24h(startTime)}
                onChange={e => handleStartTimeChange(e.target.value)}
                list="edit-job-time-options"
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-blue-500 transition-all font-semibold text-slate-800 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between">
                <span>End Time</span>
                <span className="text-blue-600 font-bold normal-case">{formatTime12h(endTime)}</span>
              </label>
              <input
                type="time"
                value={formatTime24h(endTime)}
                onChange={e => handleEndTimeChange(e.target.value)}
                list="edit-job-time-options"
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-blue-500 transition-all font-semibold text-slate-800 shadow-2xs"
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
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-blue-500 transition-all font-bold text-slate-800 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                OT Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={otHours}
                onChange={e => setOtHours(Number(e.target.value) || 0)}
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-blue-500 transition-all font-bold text-amber-700 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* ── CARD 3: Material & Financials ── */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200 p-4 space-y-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              <CreditCard size={15} />
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-slate-900">Charges & Collection</h4>
              <p className="text-[11px] text-slate-500">Material, charges, payment mode</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Material */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Material
              </label>
              <select
                value={material}
                onChange={e => setMaterial(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-teal-600 transition-all font-semibold text-slate-800 cursor-pointer shadow-2xs"
              >
                {PRESET_MATERIALS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="Other">+ Custom Material…</option>
              </select>
            </div>

            {/* Charges */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Charges (AED)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={charges}
                onChange={e => setCharges(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-teal-600 transition-all font-bold text-slate-800 shadow-2xs"
              />
            </div>

            {/* Received */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Received (AED)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={received}
                onChange={e => setReceived(e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-teal-600 transition-all font-bold text-emerald-700 shadow-2xs"
              />
            </div>

            {/* Payment Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
                Mode
              </label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-teal-600 transition-all font-bold text-slate-800 cursor-pointer shadow-2xs"
              >
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
                <option value="Monthly">Monthly</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>

          {/* Custom Material Input if 'Other' selected */}
          {material === 'Other' && (
            <div>
              <label className="block text-[11px] font-semibold text-teal-800 uppercase tracking-[0.08em] mb-1">
                Custom Material Note
              </label>
              <input
                type="text"
                value={customMaterial}
                onChange={e => setCustomMaterial(e.target.value)}
                placeholder="Specify required supplies e.g. High Ladder, Carpet Shampoo…"
                className="w-full text-[13px] px-3 py-2 border border-teal-300 rounded-xl bg-white focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs"
              />
            </div>
          )}

          {/* Pending notification badge */}
          {pendingAmount > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[12px] font-bold">
              <span>Pending Balance:</span>
              <span className="font-black text-rose-900">AED {pendingAmount.toLocaleString()}</span>
            </div>
          )}

          {/* Notes / Remarks */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
              Notes / Instructions
            </label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Key under mat, clean balcony first, customer paid advance…"
              className="w-full text-[13px] px-3 py-2 border border-[#E4E8EC] rounded-xl bg-white focus:outline-none focus:border-emerald-600 transition-all font-medium text-slate-800 shadow-2xs"
            />
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="pt-2 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-slate-600 hover:text-slate-800 font-bold cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="px-5 py-2 text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Check size={16} />
            <span>Update Entry</span>
          </Button>
        </div>

        {/* Reusable 12-hour Time Options Datalist */}
        <datalist id="edit-job-time-options">
          <option value="07:00">07:00 AM</option>
          <option value="07:30">07:30 AM</option>
          <option value="08:00">08:00 AM</option>
          <option value="08:30">08:30 AM</option>
          <option value="09:00">09:00 AM</option>
          <option value="09:30">09:30 AM</option>
          <option value="10:00">10:00 AM</option>
          <option value="10:30">10:30 AM</option>
          <option value="11:00">11:00 AM</option>
          <option value="11:30">11:30 AM</option>
          <option value="12:00">12:00 PM</option>
          <option value="12:30">12:30 PM</option>
          <option value="13:00">01:00 PM</option>
          <option value="13:30">01:30 PM</option>
          <option value="14:00">02:00 PM</option>
          <option value="14:30">02:30 PM</option>
          <option value="15:00">03:00 PM</option>
          <option value="15:30">03:30 PM</option>
          <option value="16:00">04:00 PM</option>
          <option value="16:30">04:30 PM</option>
          <option value="17:00">05:00 PM</option>
          <option value="17:30">05:30 PM</option>
          <option value="18:00">06:00 PM</option>
          <option value="18:30">06:30 PM</option>
          <option value="19:00">07:00 PM</option>
          <option value="19:30">07:30 PM</option>
          <option value="20:00">08:00 PM</option>
          <option value="20:30">08:30 PM</option>
          <option value="21:00">09:00 PM</option>
          <option value="22:00">10:00 PM</option>
        </datalist>
      </form>
    </Modal>
  )
}
