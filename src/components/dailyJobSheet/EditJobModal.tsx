import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { useData } from '@/store/DataContext'
import type { DailyJob, MaterialType, PaymentMode, Employee } from '@/types'
import {
  cleanNum,
  calcHours,
  MATERIALS,
  PAYMENT_MODES,
  COMMON_SERVICES,
} from './jobSheetUtils'
import {
  User, Clock, MapPin, CreditCard, Check, X,
  FileText, Sparkles, AlertCircle, Calendar
} from 'lucide-react'
import { notify } from '@/lib/notify'

export interface EditJobModalProps {
  open: boolean
  job: DailyJob | null
  onClose: () => void
  onSave: (id: string, patch: Partial<DailyJob>) => void
  employees: Employee[]
}

export function EditJobModal({
  open,
  job,
  onClose,
  onSave,
  employees,
}: EditJobModalProps) {
  const { clients } = useData()

  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [service, setService] = useState('')
  const [material, setMaterial] = useState<MaterialType>('No')
  const [charges, setCharges] = useState<number | string>('')
  const [received, setReceived] = useState<number | string>('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash')
  const [otHours, setOtHours] = useState<number | string>('')
  const [isOvertime, setIsOvertime] = useState(false)
  const [remarks, setRemarks] = useState('')

  useEffect(() => {
    if (!job) return
    const staffList = (job.staff_name || '')
      .split(/[,/&+]|\band\b/i)
      .map(s => s.trim())
      .filter(Boolean)
    setSelectedStaff(staffList.length > 0 ? staffList : [job.staff_name])
    setDate(job.date || '')
    setAddress(job.address || '')
    setArea(job.area || '')
    setStartTime(job.start_time || '')
    setEndTime(job.end_time || '')
    setService(job.service || '')
    setMaterial((job.material as MaterialType) || 'No')
    setCharges(job.charges ?? '')
    setReceived(job.received ?? '')
    setPaymentMode((job.payment_mode as PaymentMode) || 'Cash')
    setOtHours(job.ot_hours ?? '')
    setIsOvertime(!!job.is_overtime || cleanNum(job.ot_hours) > 0)
    setRemarks(job.remarks || '')
  }, [job])

  if (!job) return null

  const dutyHours = calcHours(startTime, endTime)

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
        const preferred = match.preferred_cleaner.split(/[,/&+]|\band\b/i).map(s => s.trim()).filter(Boolean)
        setSelectedStaff(preferred)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalStaff = selectedStaff.join(', ') || job.staff_name
    if (!finalStaff) {
      notify.error('Please assign at least one cleaner / staff member.')
      return
    }

    const targetId = (job as any)._originalJobId || job.id
    onSave(targetId, {
      date,
      staff_name: finalStaff,
      start_time: startTime,
      end_time: endTime,
      duty_hours: dutyHours,
      ot_hours: cleanNum(otHours),
      address: address.trim(),
      area: area.trim(),
      service: service.trim(),
      material,
      charges: cleanNum(charges),
      received: cleanNum(received),
      payment_mode: paymentMode,
      is_overtime: isOvertime || cleanNum(otHours) > 0,
      remarks: remarks.trim(),
    })
    notify.success('Job entry updated successfully')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Job Entry"
      size="xl"
      className="max-w-4xl"
      bodyClassName="p-4 sm:p-5"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-8 px-3 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            className="h-8 px-4 text-[11.5px] bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Check size={13} className="stroke-[2.5]" />
            <span>Save Changes</span>
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: 3-Column Executive Grid matching NewBookingModal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: Staff & Schedule (Light Teal Tint) */}
          <div className="space-y-3 bg-teal-50/40 p-4 rounded-2xl border border-teal-200/70 shadow-[0_2px_12px_rgba(13,148,136,0.04)]">
            <div className="flex items-center justify-between border-b border-teal-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-teal-100/80 text-teal-700 flex items-center justify-center">
                  <User size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-teal-900">
                  Staff & Shift
                </h4>
              </div>
              <span className="text-[9.5px] font-bold text-teal-800 bg-teal-100/80 border border-teal-300 px-2 py-0.5 rounded-full">
                {selectedStaff.length} Cleaner{selectedStaff.length === 1 ? '' : 's'}
              </span>
            </div>

            <div>
              <CleanerMultiSelect
                label="Assigned Cleaners"
                name="staff_name"
                cleaners={employees}
                selected={selectedStaff}
                onChange={setSelectedStaff}
                placeholder="Assign staff..."
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-teal-950 block mb-1">
                Shift Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full text-[12px] px-3 py-2 bg-white border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-600 font-semibold text-slate-800 shadow-2xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-teal-950 block mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-1.5 bg-white border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-600 font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-teal-950 block mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full text-[12px] px-2.5 py-1.5 bg-white border border-teal-200/80 rounded-xl focus:outline-none focus:border-teal-600 font-mono text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 bg-teal-100/50 rounded-xl border border-teal-200 text-teal-950">
              <span className="text-[11px] font-bold flex items-center gap-1">
                <Clock size={11} className="text-teal-700" />
                <span>Duty Duration</span>
              </span>
              <span className="font-black font-mono text-sm text-teal-900">
                {dutyHours > 0 ? `${dutyHours} hrs` : '—'}
              </span>
            </div>
          </div>

          {/* Card 2: Client & Location (Light Blue/Sky Tint) */}
          <div className="space-y-3 bg-sky-50/30 p-4 rounded-2xl border border-sky-200/70 shadow-[0_2px_12px_rgba(2,132,199,0.04)]">
            <div className="flex items-center justify-between border-b border-sky-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <MapPin size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-sky-950">
                  Location & Client
                </h4>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-sky-950 block mb-1">
                Address / Client Name <span className="text-red-500">*</span>
              </label>
              <input
                list="edit-job-client-addresses"
                value={address}
                onChange={e => handleSelectClientAddress(e.target.value)}
                placeholder="Client name or building..."
                required
                className="w-full text-[12px] px-3 py-2 bg-white border border-sky-200/80 rounded-xl focus:outline-none focus:border-sky-600 font-semibold text-slate-800 shadow-2xs"
              />
              <datalist id="edit-job-client-addresses">
                {clients.map(c => {
                  const label = c.building_name ? `${c.full_name} (${c.building_name}${c.area ? `, ${c.area}` : ''})` : c.full_name
                  return <option key={c.id} value={c.building_name || c.full_name}>{label}</option>
                })}
              </datalist>
            </div>

            <div>
              <label className="text-xs font-semibold text-sky-950 block mb-1">
                Area / District
              </label>
              <input
                value={area}
                onChange={e => setArea(e.target.value)}
                placeholder="e.g. Business Bay, Marina, JLT..."
                className="w-full text-[12px] px-3 py-2 bg-white border border-sky-200/80 rounded-xl focus:outline-none focus:border-sky-600 font-medium text-slate-800 shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-sky-950 block mb-1">
                Service Type
              </label>
              <input
                list="edit-job-services"
                value={service}
                onChange={e => setService(e.target.value)}
                placeholder="Standard Cleaning, Deep, etc."
                className="w-full text-[12px] px-3 py-2 bg-white border border-sky-200/80 rounded-xl focus:outline-none focus:border-sky-600 font-medium text-slate-800 shadow-2xs"
              />
              <datalist id="edit-job-services">
                {COMMON_SERVICES.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div>
              <label className="text-xs font-semibold text-sky-950 block mb-1">
                Cleaning Materials
              </label>
              <select
                value={material}
                onChange={e => setMaterial(e.target.value as MaterialType)}
                className="w-full text-[12px] px-3 py-2 bg-white border border-sky-200/80 rounded-xl focus:outline-none focus:border-sky-600 font-semibold text-slate-700 shadow-2xs"
              >
                {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Card 3: Charges, Received & Payment (Light Amber Tint) */}
          <div className="space-y-3 bg-amber-50/40 p-4 rounded-2xl border border-amber-200/80 shadow-[0_2px_12px_rgba(217,119,6,0.04)]">
            <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <CreditCard size={13} />
                </div>
                <h4 className="text-[12px] font-black uppercase tracking-wider text-amber-950">
                  Billing & Collection
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-amber-950 block mb-1">
                  Charges (AED)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={charges}
                    onChange={e => setCharges(e.target.value)}
                    placeholder="0.00"
                    className="w-full text-[13px] pl-3 pr-2 py-2 bg-white border border-amber-200/80 rounded-xl focus:outline-none focus:border-amber-600 font-mono font-bold text-slate-900 shadow-2xs"
                  />
                </div>
              </div>

              {/* Crucial Received Field (Prominently Highlighted) */}
              <div>
                <label className="text-xs font-bold text-emerald-900 block mb-1 flex items-center justify-between">
                  <span>Received (AED)</span>
                  <span className="text-[9.5px] font-extrabold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                    Collected
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={received}
                    onChange={e => setReceived(e.target.value)}
                    placeholder="0.00"
                    className="w-full text-[13px] pl-3 pr-2 py-2 bg-emerald-50/50 border-2 border-emerald-500 rounded-xl focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400 font-mono font-black text-emerald-950 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-amber-950 block mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full text-[12px] px-3 py-2 bg-white border border-amber-200/80 rounded-xl focus:outline-none focus:border-amber-600 font-semibold text-slate-800 shadow-2xs"
              >
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 items-center pt-1">
              <div>
                <label className="text-[11px] font-semibold text-amber-950 block mb-1">OT Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={otHours}
                  onChange={e => {
                    setOtHours(e.target.value)
                    if (cleanNum(e.target.value) > 0) setIsOvertime(true)
                  }}
                  placeholder="0.0"
                  className="w-full text-[12px] px-2.5 py-1.5 bg-white border border-amber-200/80 rounded-xl focus:outline-none focus:border-amber-600 font-mono text-slate-800"
                />
              </div>

              <div className="pt-4">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[12px] font-semibold text-amber-950">
                  <input
                    type="checkbox"
                    checked={isOvertime}
                    onChange={e => setIsOvertime(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                  />
                  <span>Overtime Flag</span>
                </label>
              </div>
            </div>

            {/* Quick Balance Calculation Preview */}
            <div className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-amber-200/70 text-[11px]">
              <span className="font-semibold text-slate-600">Pending Balance:</span>
              <span className={`font-mono font-black ${
                cleanNum(charges) - cleanNum(received) > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                AED {Math.max(0, cleanNum(charges) - cleanNum(received)).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Remarks / Special Notes */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
          <label className="text-xs font-semibold text-slate-700 block mb-1 flex items-center gap-1.5">
            <FileText size={12} className="text-slate-500" />
            <span>Remarks / Job Notes</span>
          </label>
          <input
            type="text"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="e.g. Balcony wash, Sofa shampoo, Online bank transfer, etc."
            className="w-full text-[12px] px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-600 font-medium text-slate-800 shadow-2xs"
          />
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="px-5 py-2 text-xs bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Check size={14} className="stroke-[2.5]" />
            <span>Update Job Entry</span>
          </Button>
        </div>
      </form>
    </Modal>
  )
}
