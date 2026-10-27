import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CleanerMultiSelect } from '@/components/common/CleanerMultiSelect'
import { useData } from '@/store/DataContext'
import type { DailyJob, MaterialType, PaymentMode, Client } from '@/types'
import {
  cleanNum,
  calcHours,
  MATERIALS,
  PAYMENT_MODES,
  COMMON_SERVICES,
} from './jobSheetUtils'

export interface AddJobFormProps {
  employees: { full_name: string }[]
  onSave: (j: Omit<DailyJob, 'id' | 'created_at'>) => void
  onClose: () => void
  initial?: Partial<DailyJob>
  clients?: Client[]
}

export function AddJobForm({
  employees,
  onSave,
  onClose,
  initial,
}: AddJobFormProps) {
  const { clients } = useData()
  const [selectedStaff, setSelectedStaff] = useState<string[]>(() => {
    if (!initial?.staff_name) return []
    return initial.staff_name.split(/[,+/&]/).map(s => s.trim()).filter(Boolean)
  })
  const [address, setAddress] = useState(initial?.address ?? '')
  const [area, setArea] = useState(initial?.area ?? '')
  const [startTime, setStartTime] = useState(initial?.start_time ?? '')
  const [endTime, setEndTime]     = useState(initial?.end_time ?? '')
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
        setSelectedStaff(match.preferred_cleaner.split(/[,+/&]/).map(s => s.trim()).filter(Boolean))
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    const finalStaff = selectedStaff.join(', ') || (fd.get('staff_name') as string) || ''
    if (!finalStaff) {
      alert('Please select at least one staff member / cleaner.')
      return
    }

    onSave({
      date:         fd.get('date') as string,
      staff_name:   finalStaff,
      start_time:   startTime,
      end_time:     endTime,
      duty_hours:   dutyHours,
      ot_hours:     cleanNum(fd.get('ot_hours')),
      address:      address || (fd.get('address') as string) || '',
      area:         area || (fd.get('area') as string) || '',
      material:     (fd.get('material') as MaterialType) || 'No',
      charges:      cleanNum(fd.get('charges')),
      received:     cleanNum(fd.get('received')),
      payment_mode: (fd.get('payment_mode') as PaymentMode) || 'Cash',
      is_overtime:  fd.get('is_overtime') === 'on' || cleanNum(fd.get('ot_hours')) > 0,
      remarks:      fd.get('remarks') as string,
      service:      (fd.get('service') as string)?.trim() || '',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <CleanerMultiSelect
            label="Staff Name"
            name="staff_name"
            cleaners={employees}
            selected={selectedStaff}
            onChange={setSelectedStaff}
            placeholder="Select cleaner(s)…"
            required
          />
        </div>
        <Input name="date" label="Date" type="date" defaultValue={initial?.date ?? new Date().toISOString().split('T')[0]} required />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Duty Hours</label>
          <div className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-slate-100 text-slate-700 font-bold">
            {dutyHours > 0 ? `${dutyHours}h` : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Address / Client</label>
          <input
            name="address"
            list="clients-address-options"
            value={address}
            onChange={e => handleSelectClientAddress(e.target.value)}
            placeholder="e.g. 202 Escape Tower, Sarah Johnson…"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-800 font-medium"
          />
          <datalist id="clients-address-options">
            {clients.map(c => {
              const label = c.building_name ? `${c.full_name} (${c.building_name}${c.area ? `, ${c.area}` : ''})` : c.full_name
              return <option key={c.id} value={c.building_name || c.full_name}>{label}</option>
            })}
          </datalist>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Location / Area</label>
          <input
            name="area"
            value={area}
            onChange={e => setArea(e.target.value)}
            placeholder="e.g. Buz Bay, NH, Mirdif…"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-800 font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input name="charges" label="Charges (AED)" type="number" min="0" step="0.01" defaultValue={initial?.charges ?? ''} placeholder="0.00" />
        <Input name="received" label="Received (AED)" type="number" min="0" step="0.01" defaultValue={initial?.received ?? ''} placeholder="0.00" />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Payment Mode</label>
          <select name="payment_mode" defaultValue={initial?.payment_mode ?? 'Cash'} className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Service</label>
          <input
            name="service"
            list="service-options"
            defaultValue={initial?.service ?? ''}
            placeholder="e.g. Sofa, Deep, House…"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
          />
          <datalist id="service-options">
            {COMMON_SERVICES.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">Material</label>
          <select name="material" defaultValue={initial?.material ?? 'No'} className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700">
            {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5">OT Hours</label>
          <input
            name="ot_hours"
            type="number"
            step="0.5"
            min="0"
            defaultValue={initial?.ot_hours ?? ''}
            placeholder="0.0"
            className="w-full text-[13px] px-3.5 py-2.5 border border-[#E4E8EC] rounded-xl bg-[#f8fafc] focus:outline-none focus:border-emerald-400 text-slate-700"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input type="checkbox" id="is_overtime" name="is_overtime" defaultChecked={initial?.is_overtime} className="w-4 h-4 rounded accent-emerald-500" />
        <label htmlFor="is_overtime" className="text-[13px] font-medium text-slate-700 cursor-pointer">Overtime (OT) Flag</label>
      </div>

      <Input name="remarks" label="Remarks" defaultValue={initial?.remarks ?? ''} placeholder="e.g. Deep clean, Sofa machine, Online…" />

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1">Save Job</Button>
      </div>
    </form>
  )
}
